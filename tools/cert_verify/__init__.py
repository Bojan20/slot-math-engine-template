"""W56 — Cert XML Verify.

Standalone verifier for v1 + v2 cert XML files (urn:slotmath:cert:v1,
urn:slotmath:cert:v2). Cross-checks the XML against an optional IR
file (recomputes ir_sha256 / ir_digest), and optionally re-runs the
cert ZIP integrity gate by invoking the existing `cert_package`
verify chain.

Use case: regulator receives cert XML + IR + cert ZIP. They want to
prove (a) the XML's namespace + required sections are present, (b)
the IR file matches the digest baked into the XML, (c) the cert ZIP
hasn't been tampered with.
"""
from tools.cert_verify.verifier import (
    CertXmlReport,
    CertVerdict,
    verify_cert_xml,
    verify_cert_xml_against_ir,
    verify_signature_b64,
)

__all__ = [
    "CertXmlReport",
    "CertVerdict",
    "verify_cert_xml",
    "verify_cert_xml_against_ir",
    "verify_signature_b64",
]
