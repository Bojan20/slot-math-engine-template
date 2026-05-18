# Dependency Upgrades — W206

CORTI W206-SECURITY — change log for dependency mutations performed
during the W206 security remediation wave.

## Summary

| Package | From | To | Reason |
|---------|------|----|--------|
| `@fastify/helmet` | (absent) | `^13.0.2` | OWASP A05 — security headers. |
| `@stryker-mutator/core` | `^8.7.1` | (held at 8.x) | See "Stryker v9 hold" below. |
| `@stryker-mutator/vitest-runner` | `^8.7.1` | (held at 8.x) | Peer pinning. |

## @fastify/helmet 13.0.2

New dependency. Registered before route registration in
`server/index.ts`; see `docs/SOC2_EVIDENCE/SECURITY_HEADERS.md` for the
per-header rationale. Adds:
- `@fastify/helmet` (1 direct dep)
- `helmet` 7.x (transitive)
- 0 new High/Critical CVEs after install.

## Stryker v9 hold

The W205 dependency scan flagged a transitive moderate ReDoS in
`ajv@^8` reachable via `@stryker-mutator/core@8.x → @inquirer/prompts`.
Upstream's fix lives in `@stryker-mutator/core@9.6.1`.

`@stryker-mutator/core@9.x` requires `vitest >= 2.0.0` as a peer.
The root project pins `vitest@^1.0.0` (5474 specs depend on its API
surface and Vite 5 build toolchain). Upgrading vitest to 2.x is a
**multi-wave migration** (breaks the `vi.mock` shape used by ~30
specs and the snapshot serializer pinning).

Decision: **hold Stryker at 8.7.1** for this wave. The transitive ReDoS
is moderate-severity, gated behind interactive prompts (only triggered
during `npx stryker init`, not during CI mutation runs), and the path
to upgrade is owned by the vitest 2.x migration ticket (planned W210
sweep).

Documented in `reports/security/DEPENDENCIES_2026-05-18.json` — the
chain remains Moderate, not High.

## Verification

```bash
npm run security:deps       # confirm no new Critical/High introduced
npm run server:test          # confirm helmet integration passes
npm test                     # confirm 5474 root specs still pass
npm run mutate -- --concurrency=1 --maxTestRunnerReuse=1   # smoke mutation
```

Last verified: 2026-05-18.
