"""Plugin marketplace bundler.

Builds a versioned ZIP for a slot-math plugin (games + tools +
vendor profiles).
"""
from __future__ import annotations
import hashlib
import json
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)


def parse_semver(v: str) -> tuple[int, int, int, str, str]:
    m = SEMVER_RE.match(v.strip())
    if not m:
        raise ValueError(f"not a valid SemVer 2.0.0 string: {v!r}")
    return (
        int(m.group(1)),
        int(m.group(2)),
        int(m.group(3)),
        m.group(4) or "",
        m.group(5) or "",
    )


# ─── manifest ──────────────────────────────────────────────────────


@dataclass
class PluginManifest:
    id: str
    name: str
    version: str
    kind: str = "slot-game"   # slot-game | tool | profile-pack
    description: str = ""
    author: str = ""
    license: str = "proprietary"
    dependencies: dict[str, str] = field(default_factory=dict)
    files: dict[str, str] = field(default_factory=dict)  # rel_path → sha256
    emitted_at_utc: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "kind": self.kind,
            "description": self.description,
            "author": self.author,
            "license": self.license,
            "dependencies": dict(self.dependencies),
            "files": dict(self.files),
            "emitted_at_utc": self.emitted_at_utc,
        }


@dataclass
class PluginBundle:
    manifest: PluginManifest
    zip_path: Path
    body_sha256: str
    signature: str | None = None    # base64 ed25519, optional

    def to_dict(self) -> dict[str, Any]:
        return {
            "manifest": self.manifest.to_dict(),
            "zip_path": str(self.zip_path),
            "body_sha256": self.body_sha256,
            "signature": self.signature,
        }


# ─── builder ───────────────────────────────────────────────────────


def _sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _slug_dir(p: Path) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]", "-", p.name).strip("-") or "x"


def _iter_files(root: Path) -> Iterable[Path]:
    for p in sorted(root.rglob("*")):
        if p.is_file():
            yield p


def build_bundle(
    *,
    plugin_id: str,
    name: str,
    version: str,
    out_dir: Path,
    games_dir: Path | None = None,
    tools_dir: Path | None = None,
    profiles_dir: Path | None = None,
    description: str = "",
    author: str = "",
    license_str: str = "proprietary",
    dependencies: dict[str, str] | None = None,
    sign_with_pem: bytes | None = None,
    kind: str = "slot-game",
    extra_files: dict[Path, str] | None = None,
) -> PluginBundle:
    """Assemble a plugin ZIP and emit the bundle metadata.

    `extra_files` is an optional dict of {source_path: arcname} for
    bespoke inclusions (e.g. README.md, vendor cert sidecars).
    """
    parse_semver(version)  # validate
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9_.-]*$", plugin_id):
        raise ValueError(
            f"plugin_id must start with a letter and use [a-zA-Z0-9_.-]: "
            f"{plugin_id!r}"
        )
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    zip_name = f"slot-plugin-{plugin_id}-{version}.zip"
    zip_path = out_dir / zip_name

    manifest = PluginManifest(
        id=plugin_id,
        name=name,
        version=version,
        kind=kind,
        description=description,
        author=author,
        license=license_str,
        dependencies=dict(dependencies or {}),
        emitted_at_utc=datetime.now(timezone.utc).isoformat(),
    )

    # Stage entries: (source_path, arcname)
    entries: list[tuple[Path, str]] = []
    if games_dir is not None and Path(games_dir).exists():
        gd = Path(games_dir)
        for p in _iter_files(gd):
            arc = f"games/{p.relative_to(gd).as_posix()}"
            entries.append((p, arc))
    if tools_dir is not None and Path(tools_dir).exists():
        td = Path(tools_dir)
        for p in _iter_files(td):
            arc = f"tools/{p.relative_to(td).as_posix()}"
            entries.append((p, arc))
    if profiles_dir is not None and Path(profiles_dir).exists():
        pd = Path(profiles_dir)
        for p in _iter_files(pd):
            arc = f"vendor_profiles/{p.relative_to(pd).as_posix()}"
            entries.append((p, arc))
    if extra_files:
        for src, arc in extra_files.items():
            entries.append((Path(src), arc))

    # Compute file hashes for manifest.files
    for src, arc in entries:
        manifest.files[arc] = _sha256_file(src)

    # Write zip atomically
    tmp = zip_path.with_suffix(zip_path.suffix + ".tmp")
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        manifest_bytes = json.dumps(
            manifest.to_dict(), indent=2, sort_keys=True
        ).encode("utf-8")
        zf.writestr("manifest.json", manifest_bytes)
        for src, arc in entries:
            zf.write(src, arc)
        # README placeholder so an operator can grep the kind/version
        readme = (
            f"# {name} v{version}\n\n"
            f"Plugin ID: `{plugin_id}` · kind: `{kind}`\n\n"
            f"{description or '(no description)'}\n"
        )
        zf.writestr("README.md", readme)
    tmp.replace(zip_path)

    body_sha256 = _sha256_file(zip_path)
    signature = None
    if sign_with_pem is not None:
        try:
            from cryptography.hazmat.primitives import serialization
            sk = serialization.load_pem_private_key(sign_with_pem,
                                                    password=None)
            import base64
            sig = sk.sign(body_sha256.encode("ascii"))
            signature = base64.b64encode(sig).decode("ascii")
            sig_path = out_dir / (zip_name + ".sig")
            sig_path.write_text(signature)
        except Exception as e:  # noqa: BLE001
            signature = None
            raise RuntimeError(f"sign failed: {e}")

    return PluginBundle(
        manifest=manifest,
        zip_path=zip_path,
        body_sha256=body_sha256,
        signature=signature,
    )


# ─── inspect ───────────────────────────────────────────────────────


def inspect_bundle(zip_path: Path) -> dict[str, Any]:
    """Open a plugin ZIP, return manifest + per-file SHA-256 audit."""
    zip_path = Path(zip_path)
    if not zip_path.exists():
        raise FileNotFoundError(zip_path)
    out: dict[str, Any] = {}
    with zipfile.ZipFile(zip_path, "r") as zf:
        with zf.open("manifest.json") as f:
            manifest = json.loads(f.read())
        out["manifest"] = manifest
        # Verify file hashes match manifest.files
        mismatches: list[str] = []
        for arc, expected in (manifest.get("files") or {}).items():
            try:
                with zf.open(arc) as f:
                    h = hashlib.sha256(f.read()).hexdigest()
                if h != expected:
                    mismatches.append(
                        f"{arc}: expected {expected}, got {h}"
                    )
            except KeyError:
                mismatches.append(f"{arc}: missing in zip")
        out["body_sha256"] = hashlib.sha256(
            zip_path.read_bytes()).hexdigest()
        out["passed"] = not mismatches
        out["mismatches"] = mismatches
    return out
