// Cortex Analyst over the SAP BDC ontology semantic view.
//
// Two steps per question, because Analyst returns SQL rather than data:
//   1. POST the question to /api/v2/cortex/analyst/message with our semantic view
//   2. execute the SQL it generates and return the rows
//
// Auth is key-pair JWT (RS256) built from ~/.snowflake/keys/*.p8, the same
// mechanism the sibling Sales 360 app uses. The private key never leaves this
// process and is not sent anywhere; only the signed JWT goes to Snowflake.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import jwt from "jsonwebtoken";
import snowflake from "snowflake-sdk";

const SEMANTIC_VIEW =
  process.env.BDC_SEMANTIC_VIEW ??
  "SAP_BDC_ONTOLOGY.CORE.SAP_BDC_ONTOLOGY_MODEL";

/** Selectable semantic views. Whitelisted: the client sends a key, never a name. */
export const SEMANTIC_VIEWS: Record<string, { name: string; label: string }> = {
  catalog: { name: SEMANTIC_VIEW, label: "SAP BDC catalog (data products, CDS entities, processes)" },
  operations: { name: process.env.SC360_SEMANTIC_VIEW ?? "SAP_SUPPLY_CHAIN.ANALYTICS.SAP_SUPPLY_CHAIN_360",
                label: "Supply Chain 360 operations (orders, OTIF, tools, components, plants)" },
};

function resolveHome(p: string): string {
  return p.startsWith("~/") ? path.join(process.env.HOME ?? "", p.slice(2)) : p;
}

let cachedKey: string | null = null;
function privateKey(): string {
  if (cachedKey) return cachedKey;
  const keyPath = resolveHome(process.env.SNOWFLAKE_PRIVATE_KEY_PATH ?? "");
  if (!keyPath) throw new Error("SNOWFLAKE_PRIVATE_KEY_PATH is not set");
  if (!fs.existsSync(keyPath)) throw new Error(`private key not found: ${keyPath}`);
  cachedKey = fs.readFileSync(keyPath, "utf-8");
  return cachedKey;
}

function fingerprint(): string {
  const pub = crypto.createPublicKey(privateKey());
  const der = pub.export({ type: "spki", format: "der" });
  return crypto.createHash("sha256").update(der).digest("base64");
}

export function generateJwt(): string {
  const account = (process.env.SNOWFLAKE_ACCOUNT ?? "").toUpperCase();
  const user = (process.env.SNOWFLAKE_USER ?? "").toUpperCase();
  if (!account || !user) {
    throw new Error("SNOWFLAKE_ACCOUNT and SNOWFLAKE_USER must be set");
  }
  const qualified = `${account}.${user}`;
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: `${qualified}.SHA256:${fingerprint()}`,
      sub: qualified,
      iat: now,
      exp: now + 3600,
    },
    privateKey(),
    { algorithm: "RS256" }
  );
}

export interface AskTurn {
  role: "user" | "analyst";
  text: string;
}

interface AnalystContent {
  type: string;
  text?: string;
  statement?: string;
  suggestions?: string[];
}

export interface AskResult {
  answer: string;
  sql: string | null;
  columns: string[];
  rows: unknown[][];
  suggestions: string[];
  rowCount: number;
  truncated: boolean;
  requestId?: string;
}

async function callAnalyst(history: AskTurn[], view = SEMANTIC_VIEW): Promise<AnalystContent[]> {
  const account = process.env.SNOWFLAKE_ACCOUNT ?? "";
  const url = `https://${account}.snowflakecomputing.com/api/v2/cortex/analyst/message`;

  // Analyst expects alternating user/analyst turns with typed content parts
  const messages = history.map((t) => ({
    role: t.role,
    content: [{ type: "text", text: t.text }],
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${generateJwt()}`,
      "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
    },
    body: JSON.stringify({ messages, semantic_view: view }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cortex Analyst ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    message?: { content?: AnalystContent[] };
    request_id?: string;
  };
  return json.message?.content ?? [];
}

let connPromise: Promise<snowflake.Connection> | null = null;
function connect(): Promise<snowflake.Connection> {
  if (connPromise) return connPromise;
  connPromise = new Promise((resolve, reject) => {
    const conn = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT ?? "",
      username: process.env.SNOWFLAKE_USER ?? "",
      authenticator: "SNOWFLAKE_JWT",
      privateKeyPath: resolveHome(process.env.SNOWFLAKE_PRIVATE_KEY_PATH ?? ""),
      role: process.env.SNOWFLAKE_ROLE ?? "ACCOUNTADMIN",
      warehouse: process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH",
      database: "SAP_BDC_ONTOLOGY",
      schema: "CORE",
    } as snowflake.ConnectionOptions);
    conn.connect((err) => (err ? reject(err) : resolve(conn)));
  });
  // a failed connect must not be cached, or every later request reuses the failure
  connPromise.catch(() => {
    connPromise = null;
  });
  return connPromise;
}

const MAX_ROWS = 500;

export async function runSql(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
  const conn = await connect();
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      complete: (err, stmt, rows) => {
        if (err) return reject(err);
        const cols = (stmt.getColumns() ?? []).map((c) => c.getName());
        const out = ((rows ?? []) as Record<string, unknown>[])
          .slice(0, MAX_ROWS)
          .map((r) => cols.map((c) => r[c] ?? null));
        resolve({ columns: cols, rows: out });
      },
    });
  });
}

export async function ask(history: AskTurn[], viewKey = "catalog"): Promise<AskResult> {
  const content = await callAnalyst(history, (SEMANTIC_VIEWS[viewKey] ?? SEMANTIC_VIEWS.catalog).name);

  const answer = content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text as string)
    .join("\n\n")
    .trim();
  const sql = content.find((c) => c.type === "sql")?.statement ?? null;
  const suggestions =
    content.find((c) => c.type === "suggestions")?.suggestions ?? [];

  if (!sql) {
    // Analyst declined to generate SQL - usually the question is out of scope.
    // Return its explanation plus suggestions rather than an empty table.
    return {
      answer: answer || "Cortex Analyst could not answer that from the ontology.",
      sql: null, columns: [], rows: [], suggestions, rowCount: 0, truncated: false,
    };
  }

  let columns: string[], rows: unknown[][];
  try {
    ({ columns, rows } = await runSql(sql));
  } catch (e: any) {
    const err: any = new Error(String(e?.message || e));
    err.generatedSql = sql;
    throw err;
  }
  return {
    answer, sql, columns, rows, suggestions,
    rowCount: rows.length,
    truncated: rows.length >= MAX_ROWS,
  };
}

export function askConfigured(): { ok: boolean; missing: string[] } {
  const missing = ["SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PRIVATE_KEY_PATH"]
    .filter((k) => !process.env[k]);
  return { ok: missing.length === 0, missing };
}

export const semanticView = SEMANTIC_VIEW;
