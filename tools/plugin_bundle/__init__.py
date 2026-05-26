"""W20 — Plugin Marketplace Bundler.

Pack a slot-math plugin (one or more game IRs + tooling extensions
+ vendor profiles + jurisdiction overrides) into a versioned,
SemVer-tagged, optionally ed25519-signed ZIP ready for upload to a
plugin marketplace.

Bundle layout:

  slot-plugin-<id>-<semver>.zip
    ├── manifest.json          # name, semver, kind, deps, sha256
    ├── README.md              # vendor-facing summary
    ├── games/                 # per-game IR + cert sidecars
    │   └── <slug>/ir.json
    │   └── <slug>/ir.lock.json (when locked)
    ├── tools/                 # optional plugin code (Python module)
    │   └── ...
    ├── vendor_profiles/       # optional YAML overrides
    └── PLUGIN_SIG             # ed25519 over manifest SHA-256 + body
"""
from tools.plugin_bundle.bundler import (
    PluginManifest,
    PluginBundle,
    build_bundle,
    inspect_bundle,
    parse_semver,
)

__all__ = [
    "PluginManifest",
    "PluginBundle",
    "build_bundle",
    "inspect_bundle",
    "parse_semver",
]
