"""Snowflake connection for the exporters, from ~/.snowflake/connections.toml."""
import pathlib


def conn_params(name="dfreriksdemo"):
    try:
        import tomllib
    except ModuleNotFoundError:
        import tomli as tomllib
    p = pathlib.Path.home() / ".snowflake" / "connections.toml"
    cfg = tomllib.loads(p.read_text())
    # connections.toml keeps entries at the top level, not under [connections].
    c = dict(cfg.get("connections", cfg)[name])
    if "private_key_path" in c:
        c["private_key_file"] = str(pathlib.Path(c.pop("private_key_path")).expanduser())
    c.setdefault("warehouse", "COMPUTE_WH")
    c["database"], c["schema"] = "SAP_SUPPLY_CHAIN", "ONTOLOGY"
    return c
