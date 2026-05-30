#!/usr/bin/env python3
"""W244 wave 67 — dossier HTML quality + dead-link lint.

Validates that every HTML page under `reports/dossier/` meets the
"offline-regulator-friendly" contract:

  1. No external script/stylesheet (no CDN — works fully offline)
  2. At least one 64-hex Merkle digest visible
  3. All internal href links resolve to real files
  4. No leaked emails / API keys / secrets (basic scan)
  5. Has <title> + <meta charset> + viewport

Exit 0 = clean; exit 1 = violations (printed to stdout).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOSSIER = REPO / "reports" / "dossier"

EXTERNAL_RE = re.compile(
    r'<(?:script|link)[^>]+(?:src|href)\s*=\s*["\']https?://',
    re.IGNORECASE,
)
HEX64_RE = re.compile(r"<code[^>]*>([0-9a-f]{64})</code>")
HREF_RE = re.compile(r'href\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
SECRET_RE = re.compile(
    r"(?i)(?:bearer\s+[A-Za-z0-9._-]+|"
    r"sk-[A-Za-z0-9]{20,}|"
    r"ghp_[A-Za-z0-9]{36}|"
    r"AKIA[0-9A-Z]{16})",
)
TITLE_RE = re.compile(r"<title[^>]*>([^<]+)</title>", re.IGNORECASE)
CHARSET_RE = re.compile(r'<meta[^>]+charset', re.IGNORECASE)


# Internal hrefs to skip from existence-check (will only resolve at deploy)
INTERNAL_SKIP_PATTERNS = [
    re.compile(r"^#"),                       # anchor
    re.compile(r"^https?://"),               # external HTTPS
    re.compile(r"^mailto:"),
]


def _is_external(href: str) -> bool:
    return any(p.match(href) for p in INTERNAL_SKIP_PATTERNS)


def _resolve_href(page: Path, href: str) -> Path:
    # Strip query / fragment
    href = href.split("#", 1)[0].split("?", 1)[0]
    return (page.parent / href).resolve()


def lint_file(p: Path) -> list[str]:
    issues: list[str] = []
    text = p.read_text(encoding="utf-8")

    # 1. External script/link
    if EXTERNAL_RE.search(text):
        issues.append("has external <script> or <link href=https://...>")

    # 2. Merkle present
    if not HEX64_RE.search(text):
        issues.append("no 64-hex Merkle digest visible")

    # 3. Title + charset + viewport
    if not TITLE_RE.search(text):
        issues.append("missing <title>")
    if not CHARSET_RE.search(text):
        issues.append("missing <meta charset>")
    if "viewport" not in text:
        issues.append("missing viewport meta")

    # 4. Secret leak scan
    secret = SECRET_RE.search(text)
    if secret:
        issues.append(f"possible secret leak: {secret.group(0)[:40]}")

    # 5. Dead internal links
    for href in HREF_RE.findall(text):
        if _is_external(href):
            continue
        target = _resolve_href(p, href)
        if not target.exists():
            issues.append(f"dead link → {href}")

    return issues


def main() -> int:
    if not DOSSIER.is_dir():
        print(f"[lint-dossier-html] missing: {DOSSIER}")
        return 1

    pages = list(DOSSIER.rglob("*.html"))
    if not pages:
        print(f"[lint-dossier-html] no HTML found in {DOSSIER}")
        return 1

    total_issues = 0
    failed_pages = 0
    for p in sorted(pages):
        issues = lint_file(p)
        if issues:
            failed_pages += 1
            total_issues += len(issues)
            rel = p.relative_to(REPO)
            print(f"\n✗ {rel}")
            for i in issues:
                print(f"    • {i}")

    print(f"\n{'─' * 60}")
    print(f"Pages scanned:  {len(pages)}")
    print(f"Failed pages:   {failed_pages}")
    print(f"Total issues:   {total_issues}")
    if total_issues == 0:
        print(f"\n✅ All {len(pages)} dossier HTML pages lint-clean.")
        return 0
    print(f"\n❌ {failed_pages} pages have issues — fix and re-lint.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
