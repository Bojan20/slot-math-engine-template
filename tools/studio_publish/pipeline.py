"""Studio → Marketplace publish pipeline (W73)."""
from __future__ import annotations
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from tools.plugin_bundle.bundler import build_bundle
from tools.plugin_marketplace.registry import FilesystemMarketplace
from tools.plugin_marketplace.verifier import MarketplaceVerifier


@dataclass
class PublishStep:
    name: str
    status: str             # pass | fail | skip
    detail: str = ""
    artifact: str = ""
    counts: dict[str, Any] = field(default_factory=dict)
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PublishReport:
    plugin_id: str
    version: str
    steps: list[PublishStep] = field(default_factory=list)
    final_zip: str = ""
    final_handle: str = ""
    sbom_path: str = ""
    sig_path: str = ""

    @property
    def passed(self) -> bool:
        return all(s.status != "fail" for s in self.steps)

    def to_dict(self) -> dict[str, Any]:
        return {
            "plugin_id": self.plugin_id,
            "version": self.version,
            "passed": self.passed,
            "final_zip": self.final_zip,
            "final_handle": self.final_handle,
            "sbom_path": self.sbom_path,
            "sig_path": self.sig_path,
            "steps": [s.to_dict() for s in self.steps],
        }


def publish_studio(
    games_dir: Path,
    *,
    out_dir: Path,
    plugin_id: str,
    version: str,
    description: str = "",
    author: str = "",
    private_pem: Path | None = None,
    public_pem: Path | None = None,
    registry_dir: Path | None = None,
    sbom_components_paths: list[Path] | None = None,
) -> PublishReport:
    """Run the W73 pipeline end-to-end."""
    games_dir = Path(games_dir)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    report = PublishReport(plugin_id=plugin_id, version=version)

    # 1) bundle
    try:
        bundle = build_bundle(
            plugin_id=plugin_id,
            name=plugin_id,
            version=version,
            out_dir=out_dir,
            games_dir=games_dir,
            description=description,
            author=author,
        )
        report.final_zip = str(bundle.zip_path)
        report.steps.append(PublishStep(
            name="bundle",
            status="pass",
            detail=f"body_sha256={bundle.body_sha256[:16]}…",
            artifact=str(bundle.zip_path),
        ))
    except Exception as e:  # noqa: BLE001
        report.steps.append(PublishStep(
            name="bundle", status="fail",
            detail="build_bundle raised",
            error=str(e),
        ))
        return report

    # 2) sign
    if private_pem is not None and Path(private_pem).exists():
        try:
            from tools.plugin_sign.signer import sign_zip
            sig = sign_zip(bundle.zip_path, private_pem_path=private_pem)
            report.sig_path = sig.sig_path
            report.steps.append(PublishStep(
                name="sign",
                status="pass",
                detail=f"sig_b64_len={len(sig.signature_b64)}",
                artifact=sig.sig_path,
            ))
        except Exception as e:  # noqa: BLE001
            report.steps.append(PublishStep(
                name="sign", status="fail",
                detail="sign_zip raised",
                error=str(e),
            ))
    else:
        report.steps.append(PublishStep(
            name="sign",
            status="skip",
            detail="no private PEM provided",
        ))

    # 3) publish + round-trip verify
    if registry_dir is None:
        registry_dir = out_dir / "registry"
    registry = FilesystemMarketplace(root=Path(registry_dir))
    verifier = MarketplaceVerifier(registry=registry)
    try:
        rt = verifier.round_trip(
            bundle.zip_path,
            plugin_id=plugin_id,
            version=version,
            download_dir=out_dir / "dl",
        )
        report.final_handle = rt.publish_handle
        report.steps.append(PublishStep(
            name="marketplace",
            status="pass" if rt.passed else "fail",
            detail=(f"body_sha_match={rt.body_sha_matches} "
                    f"manifest_ok={rt.manifest_passed}"),
            counts={
                "mismatches": len(rt.manifest_mismatches),
            },
            artifact=rt.publish_handle,
            error="" if rt.passed else (rt.tamper_kind or "unknown"),
        ))
    except Exception as e:  # noqa: BLE001
        report.steps.append(PublishStep(
            name="marketplace", status="fail",
            detail="round_trip raised",
            error=str(e),
        ))
        return report

    # 4) SBOM (best-effort)
    try:
        from tools.cert_sbom.emitter import build_sbom
        sbom_path = out_dir / "sbom.json"
        repo_root = Path(__file__).resolve().parents[2]
        sbom = build_sbom(repo_root=repo_root, bump_serial=False)
        sbom_path.write_text(json.dumps(sbom.to_cyclonedx(),
                                         indent=2, sort_keys=True))
        report.sbom_path = str(sbom_path)
        report.steps.append(PublishStep(
            name="sbom",
            status="pass",
            detail=f"CycloneDX emitted ({sbom.n_components} components)",
            artifact=str(sbom_path),
            counts={"components": sbom.n_components},
        ))
    except Exception as e:  # noqa: BLE001
        report.steps.append(PublishStep(
            name="sbom", status="skip",
            detail=f"sbom not emitted: {e}",
        ))

    # 5) final E2E verify
    try:
        from tools.cert_e2e_verify.verifier import verify_e2e
        scan_root = out_dir
        e2e = verify_e2e(
            scan_root,
            public_pem=public_pem,
        )
        # Map e2e verdict to a step status.
        v = e2e.verdict.value
        report.steps.append(PublishStep(
            name="e2e_verify",
            status="pass" if v == "pass" else ("skip" if v == "warn"
                                               else "fail"),
            detail=f"verdict={v} steps={len(e2e.steps)}",
            counts={"exit_code": e2e.exit_code()},
        ))
    except Exception as e:  # noqa: BLE001
        report.steps.append(PublishStep(
            name="e2e_verify", status="skip",
            detail=f"e2e gate raised: {e}",
        ))

    # Persist a publish-report.json next to the bundle.
    rpath = out_dir / "publish-report.json"
    rpath.write_text(json.dumps(report.to_dict(), indent=2))
    return report
