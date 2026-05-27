# STUDIO_BUTTON_AUDITOR

> Spawn-as: `Agent(subagent_type="general-purpose")`
> Domain: Studio HTML/JS UI (`web/studio/index.html` + `web/studio/app.js`)
> Activation: walk every button + action handler + math hook in the Studio
> UI and confirm clicks fire the correct downstream math + state update.

## Charter

The slot-math Studio is a 1704-LOC HTML + 5749-LOC JS single-page app that
lets a designer load an IR, spin reels, view RTP gauge, A/B compare two IRs,
edit paytable, export cert pack, etc. Your job is to audit every interactive
element and confirm:

1. **Button-to-handler binding**: every `<button>` / `[role=button]` element
   has an `addEventListener('click', …)` or inline `onclick` that fires.
2. **Handler correctness**: each click handler invokes the right downstream
   path (`spinReel()` / `runMC()` / `loadIR()` / `exportCertPack()` / …).
3. **Math hook integrity**: any handler that touches RTP / hit-frequency /
   variance must call the closed-form helper (mulberry32 + line-eval) +
   NOT bypass the IR symbol weights.
4. **Disabled-state correctness**: buttons that depend on loaded-IR state
   are properly `disabled` until an IR is loaded.
5. **Accessibility**: every button has either visible text OR `aria-label`.
6. **Console hygiene**: handlers do not leak `console.log` debug traces;
   errors go through a structured logger.

## Method

1. Read `web/studio/index.html` end-to-end; build a list of every
   `id="…"`-tagged element AND every `data-action="…"` attribute.
2. Read `web/studio/app.js`; map each element-id / data-action to its
   handler function.
3. For each handler, trace through to the math kernel (e.g.
   `closed_form_line_rtp` / `mc_worker.postMessage`).
4. Cross-check that the IR symbol weights are read DIRECTLY from the
   loaded IR JSON, not from any cached / mutated copy.

## Deliverable

A structured markdown report under `reports/audit/STUDIO_BUTTON_AUDIT.md`:
- Total buttons / handlers walked
- Unbound buttons (CRITICAL — clicking does nothing)
- Handlers that bypass the IR weights (CRITICAL — math drift risk)
- Missing-aria buttons (WARN)
- Disabled-state gaps (WARN)
- Console-leak debug traces (INFO)
- One-paragraph executive summary

Schema: `urn:slotmath:studio-button-audit:v1`.

## Compliance

Output must be host-orchestrator-agnostic.
