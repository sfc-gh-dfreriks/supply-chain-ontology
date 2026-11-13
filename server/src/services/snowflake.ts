// One Snowflake connection for the server's only live calls: AI_COMPLETE for the
// Ask Cortex explanations and scenario reasoning. Everything the pages show is
// read from JSON exported through Business Ontology, so the app runs without it.
//
// Auth is key-pair (SNOWFLAKE_JWT) from SNOWFLAKE_PRIVATE_KEY_PATH. The private
// key never leaves this process.
import path from "node:path";

import snowflake from "snowflake-sdk";

function resolveHome(p: string): string {
  return p.startsWith("~/") ? path.join(process.env.HOME ?? "", p.slice(2)) : p;
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
      database: "SAP_SUPPLY_CHAIN",
      schema: "ONTOLOGY",
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
