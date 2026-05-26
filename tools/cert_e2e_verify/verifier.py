"""Cert E2E verifier — chains every existing verifier into one verdict."""
from __future__ import annotations
import json
import zipfile
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


class E2EVerdict(str, Enum):
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"


@dataclass
class E2EStep:
    name: str
    status: str                      # pass | warn | fail | skip
    detail: str = ""
    artifact: str = ""
    counts: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class E2EReport:
    target: str
    steps: list[E2EStep] = field(default_factory=list)
    discovered: dict[str, str] = field(default_factory=dict)

    @property
    def verdict(self) -> E2EVerdict:
        if any(s.status == "fail" for s in self.steps):
            return E2EVerdict.FAIL
        if any(s.status == "warn" or s.status == "skip" for s in self.steps):
            return E2EVerdict.WARN
        return E2EVerdict.PASS

    def exit_code(self) -> int:
        v = self.verdict
        return {E2EVerdict.PASS: 0, E2EVerdict.WARN: 1, E2EVerdict.FAIL: 2}[v]

    def to_dict(self) -> dict[str, Any]:
        return {
            "target": self.target,
            "verdict": self.verdict.value,
            "exit_code": self.exit_code(),
            "discovered": dict(self.discovered),
            "steps": [s.to_dict() for s in self.steps],
        }


# ─── auto-discovery ────────────────────────────────────────────────


def _discover(target: Path) -> dict[str, Path]:
    """Walk a bundle/ZIP and locate well-known artifacts by filename."""
    out: dict[str, Path] = {}
    if not target.exists():
        return out
    # Optionally unpack a ZIP into a sibling temp dir so the rest of
    # the chain can treat it as a directory.
    if target.is_file() and target.suffix.lower() == ".zip":
        # We don't auto-extract — the orchestrator does that when
        # needed. Just record the ZIP itself.
        out["zip"] = target
        return out
    if not target.is_dir():
        return out
    for p in sorted(target.rglob("*")):
        if not p.is_file():
            continue
        name = p.name.lower()
        if name == "manifest.json" and "manifest" not in out:
            out["manifest"] = p
        elif name == "cert.xml" or name.endswith(".cert.xml"):
            out.setdefault("cert_xml", p)
        elif name in ("ir.json", "universal_ir.json") or name.endswith(".ir.json"):
            out.setdefault("ir", p)
        elif name.endswith(".zip"):
            out.setdefault("plugin_zip", p)
        elif name.endswith(".sig"):
            out.setdefault("sig", p)
        elif name.endswith("public.pem") or name == "public.pem":
            out.setdefault("public_pem", p)
        elif name == "pubkey_bundle.json":
            out.setdefault("pubkey_bundle", p)
        elif name == "sbom.json" or name == "cert-sbom.json":
            out.setdefault("sbom", p)
    return out


# ─── step runners ─────────────────────────────────────────────────


def _run_bundle_verify(bundle_dir: Path) -> E2EStep:
    from tools.bundle_verify.verifier import verify_bundle as _vb
    manifest = bundle_dir / "manifest.json"
    if not manifest.exists():
        return E2EStep(name="bundle_verify", status="skip",
                       detail="manifest.json not present")
    rep = _vb(bundle_dir)
    return E2EStep(
        name="bundle_verify",
        status="pass" if rep.passed else "fail",
        detail=f"n_entries={len(rep.entries)} n_failed={rep.n_failed}",
        counts={"entries": len(rep.entries), "failed": rep.n_failed},
        artifact=str(manifest),
        errors=[e.rel_path + ": " + e.status
                for e in rep.entries if not e.passed],
    )


def _run_cert_verify(cert_xml: Path | None, ir: Path | None) -> E2EStep:
    if cert_xml is None:
        return E2EStep(name="cert_verify", status="skip",
                       detail="cert XML not present")
    from tools.cert_verify.verifier import (
        verify_cert_xml,
        verify_cert_xml_against_ir,
    )
    report = verify_cert_xml(cert_xml)
    if ir is not None:
        report = verify_cert_xml_against_ir(cert_xml, ir, report=report)
    return E2EStep(
        name="cert_verify",
        status="pass" if report.verdict.value == "pass" else "fail",
        detail=(
            f"schema={report.detected_schema} "
            f"sections={len(report.sections)} "
            f"missing={len(report.missing_sections)} "
            f"ir_digest={report.ir_digest_matches}"
        ),
        counts={
            "sections": len(report.sections),
            "missing": len(report.missing_sections),
            "jurisdictions": len(report.jurisdiction_ids),
        },
        artifact=str(cert_xml),
        errors=list(report.errors),
        warnings=list(report.warnings),
    )


def _run_plugin_sign(
    plugin_zip: Path | None, sig_path: Path | None,
    public_pem: Path | None,
) -> E2EStep:
    if plugin_zip is None or sig_path is None or public_pem is None:
        missing = [n for n, v in (("zip", plugin_zip),
                                   ("sig", sig_path),
                                   ("public.pem", public_pem))
                   if v is None]
        return E2EStep(
            name="plugin_sign",
            status="skip",
            detail=f"missing: {','.join(missing)}",
        )
    try:
        from tools.plugin_sign.signer import verify_zip
        res = verify_zip(
            plugin_zip, public_pem_path=public_pem, sig_path=sig_path,
        )
    except Exception as e:  # noqa: BLE001
        return E2EStep(
            name="plugin_sign", status="fail",
            detail=f"signer raised: {e}",
        )
    return E2EStep(
        name="plugin_sign",
        status="pass" if res.passed else "fail",
        detail=f"sha256={res.body_sha256[:16]}…",
        artifact=str(plugin_zip),
        errors=[res.error] if res.error else [],
    )


def _run_pubkey_bundle(
    bundle_path: Path | None,
    keys_root: Path | None,
    master_pub: Path | None,
) -> E2EStep:
    if bundle_path is None:
        return E2EStep(name="pubkey_bundle", status="skip",
                       detail="pubkey_bundle.json not present")
    from tools.pubkey_bundle.bundle import verify_bundle
    try:
        rep = verify_bundle(
            bundle_path=bundle_path,
            keys_root=keys_root or bundle_path.parent,
            master_public_pem=master_pub,
        )
    except Exception as e:  # noqa: BLE001
        return E2EStep(
            name="pubkey_bundle", status="fail",
            detail=f"verify raised: {e}",
        )
    status = "pass"
    if rep.n_pubkey_mismatch:
        status = "fail"
    elif rep.sig_valid is False:
        status = "fail"
    elif rep.sig_valid is None:
        status = "warn"
    return E2EStep(
        name="pubkey_bundle",
        status=status,
        detail=(
            f"entries={rep.n_entries} mismatch={rep.n_pubkey_mismatch} "
            f"sig_valid={rep.sig_valid}"
        ),
        counts={
            "entries": rep.n_entries,
            "mismatch": rep.n_pubkey_mismatch,
        },
        artifact=str(bundle_path),
        errors=list(rep.issues),
    )


def _run_sbom_present(sbom: Path | None) -> E2EStep:
    if sbom is None:
        return E2EStep(name="sbom", status="skip",
                       detail="cert SBOM not present")
    try:
        data = json.loads(sbom.read_text())
    except (json.JSONDecodeError, OSError) as e:
        return E2EStep(name="sbom", status="fail",
                       detail=f"unreadable: {e}", artifact=str(sbom))
    n_comp = len(data.get("components") or [])
    if n_comp == 0:
        return E2EStep(
            name="sbom", status="warn",
            detail="SBOM has no components", artifact=str(sbom),
        )
    return E2EStep(
        name="sbom", status="pass",
        detail=f"components={n_comp}",
        counts={"components": n_comp},
        artifact=str(sbom),
    )


# ─── public entry ──────────────────────────────────────────────────


def verify_e2e(
    target: Path,
    *,
    public_pem: Path | None = None,
    master_public_pem: Path | None = None,
    keys_root: Path | None = None,
) -> E2EReport:
    """Run every verifier against ``target`` (dir or ZIP)."""
    target = Path(target)
    report = E2EReport(target=str(target))

    if target.is_file() and target.suffix.lower() == ".zip":
        # Extract once to a sibling temp dir for the chain.
        import tempfile
        td = Path(tempfile.mkdtemp(prefix="e2e-verify-"))
        with zipfile.ZipFile(target, "r") as zf:
            zf.extractall(td)
        scan_root = td
        report.discovered["unpacked_to"] = str(td)
    else:
        scan_root = target

    discovered = _discover(scan_root)
    report.discovered.update({k: str(v) for k, v in discovered.items()})

    # 1) manifest SHA-256 audit (only if we have a directory)
    if scan_root.is_dir():
        report.steps.append(_run_bundle_verify(scan_root))
    else:
        report.steps.append(E2EStep(
            name="bundle_verify", status="skip",
            detail="target is not a directory",
        ))

    # 2) cert XML namespace + IR digest cross-check
    report.steps.append(_run_cert_verify(
        discovered.get("cert_xml"),
        discovered.get("ir"),
    ))

    # 3) plugin sign (zip + sidecar + public.pem)
    report.steps.append(_run_plugin_sign(
        discovered.get("plugin_zip"),
        discovered.get("sig"),
        public_pem or discovered.get("public_pem"),
    ))

    # 4) pubkey bundle verify (if present)
    report.steps.append(_run_pubkey_bundle(
        discovered.get("pubkey_bundle"),
        keys_root,
        master_public_pem,
    ))

    # 5) SBOM presence/shape check
    report.steps.append(_run_sbom_present(discovered.get("sbom")))

    return report
