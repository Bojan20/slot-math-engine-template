# Security CVE Exceptions

> Last reviewed: W213 Faza 600.2 (2026-05-18)
> Next review cadence: quarterly

This document lists CVEs that the W213 security audit suppresses
**by exception**, together with the rationale and the compensating
controls. The exception list is encoded as code in
`scripts/security/audit.mjs` (`CVE_DEV_ONLY_PACKAGES`); this file is
the human-readable companion that the Vendor B security team reviews.

Every exception MUST cite:

1. Why the dependency cannot be upgraded right now (fix unavailable,
   semver-major break, etc.).
2. The reachability claim (dev-only? sandboxed? non-prod manifest?).
3. The compensating control that brings residual risk to acceptable.
4. The target re-evaluation date.

## Active exceptions

### Dev-only test/mutation toolchain (vitest / stryker / esbuild)

| Package | Severity | Why | Reachability | Compensating control | Re-eval |
|---|---|---|---|---|---|
| `@stryker-mutator/core` | moderate | upstream fix requires semver-major upgrade to v9; v9 changes the runner API and would require ~200 spec rewrites | dev-only — used only via `npm run mutate`; never bundled, never deployed to prod | sandbox-free CI; no production reachability | 2026-08-18 (quarterly) |
| `@stryker-mutator/vitest-runner` | moderate | tied to stryker-core@9 upgrade above | dev-only — see above | same as above | 2026-08-18 |
| `@inquirer/prompts` | low | transitive of `@stryker-mutator/core` | dev-only | same as above | 2026-08-18 |
| `@inquirer/editor` | low | transitive of `@inquirer/prompts` | dev-only | same as above | 2026-08-18 |
| `external-editor` | low | transitive of `@inquirer/editor` | dev-only | same as above | 2026-08-18 |
| `tmp` | low | GHSA-52f5-9888-hmc6 (symlink dir write); transitive of `external-editor` | dev-only | same as above | 2026-08-18 |
| `ajv` | moderate | GHSA-2g4f-4pwh-qvx6 (ReDoS); transitive of stryker | dev-only | server runtime uses a separate, patched `ajv` (>=8.18) | 2026-08-18 |
| `vitest` | moderate | upstream fix is semver-major (v4); CI specs were validated on v1 | dev-only — only `npm test`, never bundled | dev-only; no prod reachability | 2026-08-18 |
| `vite` | moderate | transitive of `vitest`; would require vite@7 | dev-only — used only for the studio dev-server | served only on localhost during development; prod build uses `npm run build` which emits static assets without the dev server | 2026-08-18 |
| `vite-node` | moderate | transitive of `vitest` | dev-only | same as `vite` | 2026-08-18 |
| `esbuild` | moderate | GHSA-67mh-4wv8-2f99 (dev-server CSRF); transitive of `vite` | dev-only — esbuild dev mode never runs in prod | same as `vite` | 2026-08-18 |
| `postcss` | moderate | GHSA-qx2v-qp2m-jg93 (XSS via unescaped `</style>`); transitive of vite | dev-only | prod CSS is pre-built and minified by `vite build`; no runtime CSS string ingestion in prod | 2026-08-18 |

### Browser document parser (web/studio)

| Package | Severity | Why | Reachability | Compensating control | Re-eval |
|---|---|---|---|---|---|
| `xlsx` (SheetJS community) | high | upstream community edition has no fixed release; the Pro edition addresses the CVEs but is paid-licensed and outside the open-source scope | studio-only (web/studio bundle); used to parse a math designer's GDD spreadsheet upload (`gdd-parser.ts → parseXLSX`); never executes on the server | (a) parsing happens entirely in the browser, on user-provided input that the same user uploaded; (b) the parsed output is JSON, never executed; (c) prototype-pollution and ReDoS impact the uploader's own session only — no multi-tenant blast radius; (d) the studio UI runs behind the W208 tenant isolation layer | 2026-08-18 — track SheetJS Community v0.20+ release |

## Process

When a new CVE appears at HIGH or CRITICAL:

1. **Triage**: classify reachability (prod vs dev vs studio-only).
2. **Try upgrade**: `npm audit fix`; if breaking, evaluate the cost.
3. **If unfixable**: add a row above with the four fields, then add
   the package name to `CVE_DEV_ONLY_PACKAGES` in
   `scripts/security/audit.mjs`.
4. **Open a tracking ticket** with the re-eval date.

The Vendor B operator-package zip ships a snapshot of this file alongside
`AUDIT_REPORT.md` so the regulator has the full provenance.
