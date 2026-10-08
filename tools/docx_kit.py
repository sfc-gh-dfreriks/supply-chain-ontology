#!/usr/bin/env python3
"""Shim. The real implementation lives in one place.

This module used to be a byte-for-byte copy in each asset repo, so a branding or
layout fix applied in one repo silently missed the others. The implementation now
lives once, owned by the Finance 360 repo and versioned with it:

    sap-bdc-finance-360/tools/sap_docx_kit.py

Every repo keeps this shim so existing call sites (`from docx_kit import h1,
table, ...`) continue to work unchanged.

Add nothing here. Edit sap_docx_kit.py instead.

Note for anyone cloning a Supply Chain repo on its own: the path below is
absolute, so the Word builders need sap-bdc-finance-360 checked out alongside.
The failure is loud rather than silent.
"""
import pathlib
import sys

_OWNER = (pathlib.Path.home() / "Documents" / "SAP" / "SAP Skills"
          / "sap-bdc-finance-360" / "tools")

if not (_OWNER / "sap_docx_kit.py").exists():
    raise ImportError(
        f"shared docx kit not found at {_OWNER}/sap_docx_kit.py — check out "
        "sap-bdc-finance-360 alongside this repo; the Word deliverables cannot "
        "be built without it"
    )
if str(_OWNER) not in sys.path:
    sys.path.insert(0, str(_OWNER))

from sap_docx_kit import *  # noqa: F401,F403  (re-export)
from sap_docx_kit import (  # noqa: F401  explicit, so linters and IDEs resolve them
    AMBER,
    BLUE_HEX,
    GREEN,
    GREY,
    LIGHT_HEX,
    NAVY_HEX,
    RED,
    SAP_NAVY,
    SNOW_BLUE,
    body,
    bullet,
    callout,
    fixed,
    h1,
    h2,
    money,
    no_split,
    rich,
    setup_page,
    shade,
    table,
)
