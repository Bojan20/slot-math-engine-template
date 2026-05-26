"""W22 — IR Schema Versioning + Migration framework.

The universal IR has evolved across phases (W4.1, W4.7, W4.9, W6.x).
This package gives every IR a `schema_version` stamp and a forward-
migration chain so an operator with an old IR can upgrade it to the
latest shape deterministically.

API:
    from tools.ir_schema import (
        CURRENT_SCHEMA_VERSION,
        detect_version,
        migrate_to_latest,
        list_migrations,
    )

    ir2 = migrate_to_latest(ir1)
"""
from .migrate import (
    CURRENT_SCHEMA_VERSION,
    detect_version,
    list_migrations,
    migrate,
    migrate_to_latest,
)

__all__ = [
    "CURRENT_SCHEMA_VERSION",
    "detect_version",
    "list_migrations",
    "migrate",
    "migrate_to_latest",
]
