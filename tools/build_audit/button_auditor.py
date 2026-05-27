"""PHASE 44 — Build Button Auditor.

For every button-id in the Studio Build section, prove:

  * the button element exists in `web/studio/index.html` inside the
    `panel-build` section,
  * carries an accessibility surface (`title=` OR `aria-label=`),
  * its click handler is reachable in `web/studio/app.js`,
  * the handler contains no silent catch (every `catch (…)` block
    must surface a UI signal — toast / setStatusBadge / console.warn
    is the minimum; bare `catch (e) {}` is FAIL).

The auditor is pure regex + lightweight AST grep — no Selenium / Playwright /
headless browser needed. Findings ship as `ButtonFinding` dataclasses and
are written to `reports/build_audit/<button_id>.audit.json`.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


# Canonical Build-section buttons. Each entry maps button_id → expected
# handler ident (regex-friendly substring). When you add a new Build
# button, also add it here so the auditor doesn't accidentally miss it.
BUILD_BUTTON_IDS: list[tuple[str, str, str]] = [
    # (button_id,            handler_substring,            human_label)
    ("btn-quickstart",       "Quickstart",                  "Quickstart wizard"),
    ("btn-validate",         "validate",                    "Validate IR"),
    ("btn-autobalance",      "autoBalance",                 "Auto-balance reel weights"),
    ("btn-compute",          "computeRtp",                  "Compute RTP (closed-form)"),
    ("btn-play-template",    "playTemplate",                "Build playable template"),
    ("btn-build-more",       "buildMore",                   "More actions menu"),
]


@dataclass
class ButtonFinding:
    button_id: str
    label: str
    verdict: str           # "PASS" | "WARN" | "FAIL"
    element_found: bool
    in_build_panel: bool
    accessibility_ok: bool
    has_title_or_aria: bool
    handler_reachable: bool
    handler_silent_catch: bool
    evidence: list[dict[str, Any]] = field(default_factory=list)
    fixes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ─── HTML extraction ───────────────────────────────────────────────────────


_PANEL_BUILD_OPEN = re.compile(r'<section[^>]*id="panel-build"', re.I)
_PANEL_CLOSE = re.compile(r'</section\s*>', re.I)


def _extract_build_panel(html: str) -> str:
    """Return the substring of `html` inside the panel-build section.

    Falls back to the whole document when the section is absent so the
    auditor still produces a finding (handler_reachable=False) rather
    than crashing on a bad layout.
    """
    m = _PANEL_BUILD_OPEN.search(html)
    if not m:
        return ""
    start = m.start()
    # Naive depth tracker — the studio panel has nested <section> too.
    depth = 0
    pos = start
    for tag in re.finditer(r'<section[^>]*>|</section>', html[start:], re.I):
        token = tag.group(0)
        if token.startswith("<section"):
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                return html[start : start + tag.end()]
    return html[start:]  # unclosed; return tail


def _find_button_block(panel_html: str, button_id: str) -> str | None:
    pattern = re.compile(
        rf'<button[^>]*id="{re.escape(button_id)}"[^>]*>.*?</button>',
        re.I | re.S,
    )
    m = pattern.search(panel_html)
    return m.group(0) if m else None


def _has_accessibility(button_html: str) -> tuple[bool, bool]:
    """Return (any_label_present, has_title_attr)."""
    has_title = bool(re.search(r'\btitle="[^"]+"', button_html))
    has_aria = bool(re.search(r'\baria-label="[^"]+"', button_html))
    return (has_title or has_aria, has_title)


# ─── Handler extraction ────────────────────────────────────────────────────


_GETBYID_RE = re.compile(r'getElementById\(\s*["\']({})["\']\s*\)')
_QUERYSEL_RE = re.compile(r'querySelector\(\s*["\']#({})["\']\s*\)')
_DOLLAR_RE = re.compile(r'\$\s*\(\s*["\']#({})["\']\s*\)')


def _handler_reachable_in_app_js(app_js: str, button_id: str) -> tuple[bool, str | None]:
    """Return (reachable, snippet) — `reachable` is True when the button
    id appears in a getElementById / querySelector / $('#id') call."""
    for pat in (_GETBYID_RE, _QUERYSEL_RE, _DOLLAR_RE):
        m = pat.search(app_js.format(re.escape(button_id))) if False else pat.search(app_js)
        # The regex was templated; rebuild it now for the actual id.
    # Direct call:
    for pat_str in (
        rf'getElementById\(\s*["\']{re.escape(button_id)}["\']\s*\)',
        rf'querySelector\(\s*["\']#{re.escape(button_id)}["\']\s*\)',
        rf'\$\(\s*["\']#{re.escape(button_id)}["\']\s*\)',
    ):
        m = re.search(pat_str, app_js)
        if m:
            # Grab a small window around the hit for evidence.
            start = max(0, m.start() - 30)
            end = min(len(app_js), m.end() + 80)
            return True, app_js[start:end]
    return False, None


# Silent-catch detector — `catch (e) { }` or `catch { }` or
# `catch (e) { /* nothing */ }` with no toast / status / warn / log inside.
_SILENT_CATCH_RE = re.compile(
    r'catch\s*(?:\(\s*[^)]*\)\s*)?\{([^{}]*)\}',
    re.S,
)


def _has_silent_catch(app_js: str, around_button_id: str) -> bool:
    """Detect silent catch blocks ONLY inside the click-handler body of
    `around_button_id`.

    The handler is matched as an arrow function passed to
    `addEventListener("click", (...) => { … })` directly adjacent to
    the `getElementById('btn-…')` / `$('#btn-…')` lookup. This
    eliminates the ±N-char window false-positives where a neighbour
    handler's `catch (_) {}` would taint the audit.

    A block is "silent" iff its body contains NO call to:
      toast / setStatusBadge / console.warn|error / showError / notify /
      alert / logError / statusBadge / showToast.
    """
    SURFACE_SIGNS = (
        "toast(",
        "setStatusBadge(",
        "console.warn(",
        "console.error(",
        "showError(",
        "showToast(",
        "statusBadge(",
        "notify(",
        "alert(",
        "logError(",
    )
    handler_bodies = _extract_click_handler_bodies(app_js, around_button_id)
    for body in handler_bodies:
        for cm in _SILENT_CATCH_RE.finditer(body):
            inner = cm.group(1)
            stripped = re.sub(r"//[^\n]*", "", inner).strip()
            stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.S).strip()
            if not stripped:
                # Empty catch body — silent by definition.
                return True
            if not any(s in inner for s in SURFACE_SIGNS):
                return True
    return False


def _extract_click_handler_bodies(app_js: str, button_id: str) -> list[str]:
    """Return the body strings of every click handler registered against
    `button_id`. Supports:

        $("#id").addEventListener("click", (e) => { … });
        document.getElementById("id").addEventListener("click", () => { … });
        $("#id").addEventListener("click", function (e) { … });

    Plus the "one-liner thunk that delegates to a named function" pattern:

        $("#id").addEventListener("click", () => doSomething());

    For the thunk pattern, we also look up the named function body when
    the name is reachable in `app_js` and append it. This means a silent
    catch inside the named function still trips the auditor.
    """
    bodies: list[str] = []
    pattern = re.compile(
        rf'(?:getElementById|querySelector|\$)\s*\(\s*["\']#?{re.escape(button_id)}["\']\s*\)\s*'
        rf'\.addEventListener\(\s*["\']click["\']\s*,\s*',
        re.S,
    )
    for m in pattern.finditer(app_js):
        # After the comma, the next token is either `(args) =>`, `args =>`,
        # `function (args)`, or `namedFn`.
        rest = app_js[m.end():]
        # Try arrow / function literal with explicit body.
        body = _consume_function_literal(rest)
        if body is not None:
            bodies.append(body)
            # When the arrow body is JUST a delegating call like
            # `() => handleClick()`, ALSO resolve the named function body
            # so a silent catch inside the delegate trips the auditor.
            inner = body.strip().lstrip("{").rstrip("}")
            delegate = re.match(r"\s*([A-Za-z_$][\w$]*)\s*\(", inner)
            if delegate:
                for fbody in _named_function_bodies(app_js, delegate.group(1)):
                    bodies.append(fbody)
            continue
        # Try named function thunk on its own (no arrow wrapper).
        name_match = re.match(r'\s*([A-Za-z_$][\w$]*)\s*\(', rest)
        if name_match:
            name = name_match.group(1)
            for fbody in _named_function_bodies(app_js, name):
                bodies.append(fbody)
    return bodies


def _consume_function_literal(src: str) -> str | None:
    """If `src` starts with an arrow function or function expression,
    return its body as a string. Otherwise return None."""
    # Arrow: optional parens, then `=>`, then either `{…}` or expression.
    arrow_match = re.match(
        r'\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*',
        src,
    )
    func_match = re.match(r'\s*function\s*\*?\s*[A-Za-z_$]?[\w$]*\s*\(', src)
    if arrow_match:
        rest = src[arrow_match.end():]
        if rest.startswith("{"):
            return _match_braces(rest)
        # Expression arrow: take up to the matching `)` of the
        # addEventListener call. Use a small lookahead.
        end = _scan_to_paren_close(rest)
        return rest[:end]
    if func_match:
        # Skip the parameter list.
        rest = src[func_match.end():]
        paren_end = _scan_to_paren_close(rest)
        rest = rest[paren_end + 1:]
        if rest.lstrip().startswith("{"):
            return _match_braces(rest.lstrip())
    return None


def _match_braces(src: str) -> str | None:
    """Given `src` starting with `{`, return the substring up to and
    including the matching `}`. Returns None if unbalanced."""
    if not src.startswith("{"):
        return None
    depth = 0
    for i, ch in enumerate(src):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return src[: i + 1]
    return None


def _scan_to_paren_close(src: str) -> int:
    """Return the index of the matching `)` for the current open paren
    nesting. Used for expression-arrow tail consumption."""
    depth = 1
    for i, ch in enumerate(src):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i
    return len(src)


def _named_function_bodies(app_js: str, fn_name: str) -> list[str]:
    """Locate `function fn_name(...) { … }` declarations and return
    their bodies. Used when a click handler delegates to a named
    function."""
    bodies: list[str] = []
    pattern = re.compile(
        rf'function\s+{re.escape(fn_name)}\s*\([^)]*\)\s*',
        re.S,
    )
    for m in pattern.finditer(app_js):
        rest = app_js[m.end():]
        body = _match_braces(rest.lstrip())
        if body:
            bodies.append(body)
    return bodies


# ─── Public entry ──────────────────────────────────────────────────────────


def audit_build_buttons(
    repo_root: Path | str,
) -> list[ButtonFinding]:
    """Walk every Build-section button and emit a `ButtonFinding`.

    Pure file-system scan — no browser. Suitable for CI gate runs.
    """
    repo_root = Path(repo_root)
    html_path = repo_root / "web" / "studio" / "index.html"
    js_path = repo_root / "web" / "studio" / "app.js"
    if not html_path.exists() or not js_path.exists():
        # No studio bundle on this checkout (e.g. agent-only deployment).
        # Surface every button as element_found=False so the caller knows.
        return [
            ButtonFinding(
                button_id=bid,
                label=label,
                verdict="FAIL",
                element_found=False,
                in_build_panel=False,
                accessibility_ok=False,
                has_title_or_aria=False,
                handler_reachable=False,
                handler_silent_catch=False,
                evidence=[{"detail": "web/studio/{index.html,app.js} missing"}],
                fixes=["restore studio bundle or skip audit on this checkout"],
            )
            for bid, _, label in BUILD_BUTTON_IDS
        ]

    html = html_path.read_text(encoding="utf-8")
    js = js_path.read_text(encoding="utf-8")
    panel_html = _extract_build_panel(html)

    findings: list[ButtonFinding] = []
    for button_id, handler_substr, label in BUILD_BUTTON_IDS:
        block = _find_button_block(panel_html, button_id)
        element_found = block is not None
        in_build_panel = element_found  # by construction
        access_ok, has_title = (False, False)
        if block:
            access_ok, has_title = _has_accessibility(block)
        reachable, evidence_snippet = _handler_reachable_in_app_js(js, button_id)
        silent_catch = _has_silent_catch(js, button_id)

        # Verdict logic
        if not element_found:
            verdict = "FAIL"
        elif not reachable:
            verdict = "FAIL"
        elif silent_catch:
            verdict = "FAIL"
        elif not access_ok:
            verdict = "WARN"
        else:
            verdict = "PASS"

        evidence: list[dict[str, Any]] = []
        fixes: list[str] = []
        if not element_found:
            fixes.append(f"add <button id={button_id!r}> inside panel-build")
        if element_found and not access_ok:
            fixes.append(f"add title= or aria-label= to {button_id!r}")
        if not reachable:
            fixes.append(
                f"wire #{button_id} via "
                f"document.getElementById('{button_id}').addEventListener('click', …)"
            )
        if silent_catch:
            fixes.append(
                f"add toast() / setStatusBadge() / console.warn() inside the "
                f"catch block around #{button_id} handler"
            )
        if evidence_snippet:
            evidence.append({"file": "web/studio/app.js", "snippet": evidence_snippet})
        if block:
            evidence.append({"file": "web/studio/index.html", "snippet": block[:200]})

        findings.append(
            ButtonFinding(
                button_id=button_id,
                label=label,
                verdict=verdict,
                element_found=element_found,
                in_build_panel=in_build_panel,
                accessibility_ok=access_ok,
                has_title_or_aria=has_title,
                handler_reachable=reachable,
                handler_silent_catch=silent_catch,
                evidence=evidence,
                fixes=fixes,
            )
        )
    return findings
