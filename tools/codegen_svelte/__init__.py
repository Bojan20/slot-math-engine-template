"""W4.6 — Svelte UI skeleton codegen.

Emits a self-contained SvelteKit-shaped UI package for a generated game:

    <out>/<slug>-ui/
        package.json        — name=<slug>-ui + svelte + vite deps
        svelte.config.js    — adapter-static for offline deploy
        vite.config.ts      — base vite config
        src/
            app.html        — minimal HTML shell
            routes/
                +page.svelte  — reel grid + paytable + spin button
        static/
            ir.json         — IR snapshot for client-side fetch
        README.md           — `npm run dev` quickstart

Renders a reels × rows grid + paytable list + bonus-feature kinds
read from `IR.features`. Layout adapts: rows + cols come from
`IR.topology`, paylines visualization is paytable-row count.

Pure-Python emission — no Vite/Svelte execution in the codegen call.
"""
from tools.codegen_svelte.codegen import (
    write_svelte_codegen,
    slugify,
)

__all__ = [
    "write_svelte_codegen",
    "slugify",
]
