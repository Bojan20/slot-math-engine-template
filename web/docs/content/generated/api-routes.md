# Auto-generated API routes

Generated from `server/routes/*.ts` by `scripts/generate-api-docs.mjs`. 
Captures 45 routes across 11 route files. 
Re-run via `npm run docs:gen`. See **REST API** for the hand-curated narrative.

## admin.ts
> CORTI 200.6-DEVOPS — tenant admin API. GET    /api/admin/tenants POST   /api/admin/tenants GET    /api/admin/tenants/:id PATCH  /api/admin/tenants/:id DELETE /api/admin/tenants/:id Also installs a `preHandler` hook that resolves the tenant from the `X-Tenant-Id` header and enforces the per-tenant rate limit. In production these endpoints would sit behind operator auth (JWT with admin scope). Here we keep them open so smoke deploys and tests can drive CRUD directly.
| Method | Path |
|---|---|
| `GET` | `/api/admin/tenants` |
| `POST` | `/api/admin/tenants` |
| `GET` | `/api/admin/tenants/:id` |
| `PATCH` | `/api/admin/tenants/:id` |
| `DELETE` | `/api/admin/tenants/:id` |

## audit.ts
> CORTI 200.4-BACKEND — audit log endpoints. POST /api/audit/append GET  /api/audit/:sessionId GET  /api/audit/replay/:auditId
| Method | Path |
|---|---|
| `POST` | `/api/audit/append` |
| `GET` | `/api/audit/:sessionId` |
| `GET` | `/api/audit/replay/:auditId` |

## catalog.ts
> W208 Faza 400.1 — Catalog read endpoint. GET  /api/catalog                 → full catalog (cached 5 min) GET  /api/catalog/:gameId         → single entry (cached 5 min) POST /api/catalog/_invalidate     → drop the per-tenant catalog cache The catalog read is heavy enough on cold start (full IR-library JSON traversal) to be worth caching aggressively; it changes only when the games registry is updated.
| Method | Path |
|---|---|
| `GET` | `/api/catalog` |
| `GET` | `/api/catalog/:gameId` |
| `POST` | `/api/catalog/_invalidate` |

## cert.ts
> CORTI W204-PROTOCOLS — cert submission endpoints. POST /api/cert/submit GET  /api/cert/:submissionId GET  /api/cert/:submissionId/download                — operator-package.zip GET  /api/cert/:submissionId/par.pdf                 — real PAR PDF (pdf-lib) GET  /api/cert/:submissionId/verify-signature        — ed25519 verify
| Method | Path |
|---|---|
| `POST` | `/api/cert/submit` |
| `GET` | `/api/cert/:submissionId` |
| `GET` | `/api/cert/:submissionId/download` |
| `GET` | `/api/cert/:submissionId/par.pdf` |
| `POST` | `/api/cert/:submissionId/approve` |
| `POST` | `/api/cert/:submissionId/reject` |
| `GET` | `/api/cert/:submissionId/verify-signature` |

## gaas.ts
> CORTI W204-PROTOCOLS — Gaming-as-a-Service (GaaS) API with real WebSocket /live endpoint. POST /api/gaas/compute-rtp   — closed-form RTP estimate for an IR POST /api/gaas/render-ir     — operator-facing render config from IR POST /api/gaas/spin          — server-authoritative spin (wallet+audit) GET  /api/gaas/seamless      — operator integration handshake GET  /api/gaas/live          — WebSocket: real-time spin/wallet events HTTP API-key auth: pass `x-api-key: <key>`. The li
| Method | Path |
|---|---|
| `POST` | `/api/gaas/compute-rtp` |
| `POST` | `/api/gaas/render-ir` |
| `POST` | `/api/gaas/spin` |
| `GET` | `/api/gaas/seamless` |
| `GET` | `/api/gaas/live` |

## health.ts
> CORTI 200.6-DEVOPS — extended health + metrics endpoints. GET /api/health        compact per-component status (already wired in server/index.ts; we add a richer payload here as a drop-in replacement) GET /api/health/deep   runs a canary spin against the in-memory session store + audit chain; latency reported GET /api/metrics       Prometheus text-format export (uptime, per-store sizes, audit entry count, etc.) The deep probe deliberately uses the same APIs as a real client: r
| Method | Path |
|---|---|
| `GET` | `/api/health` |
| `GET` | `/api/health/deep` |
| `GET` | `/api/metrics` |

## license.ts
> CORTI W206-ONBOARDING — license API. POST  /api/license/verify             body { licenseKey } → { valid, tier, expiresAt, features } GET   /api/license/:tenantId/usage    daily/monthly metrics + caps + remaining POST  /api/license/:tenantId/upgrade  body { tier } request upgrade to pro/enterprise POST  /api/license/:tenantId/usage    body { kind } record game/mc_run/cert_sub (cap-checked) GET   /api/license/:tenantId/expiry   trial expiry classification + warning/lockout fir
| Method | Path |
|---|---|
| `POST` | `/api/license/verify` |
| `GET` | `/api/license/:tenantId/usage` |
| `POST` | `/api/license/:tenantId/upgrade` |
| `POST` | `/api/license/:tenantId/usage` |
| `GET` | `/api/license/:tenantId/expiry` |

## lobby.ts
> CORTI 200.4-BACKEND — lobby endpoints. GET  /api/lobby/games POST /api/lobby/launch
| Method | Path |
|---|---|
| `GET` | `/api/lobby/games` |
| `POST` | `/api/lobby/_invalidate` |
| `POST` | `/api/lobby/launch` |

## session.ts
> CORTI 200.4-BACKEND — session lifecycle endpoints. POST   /api/session/create GET    /api/session/:sessionId DELETE /api/session/:sessionId POST   /api/session/:sessionId/spin
| Method | Path |
|---|---|
| `POST` | `/api/session/create` |
| `GET` | `/api/session/:sessionId` |
| `DELETE` | `/api/session/:sessionId` |
| `POST` | `/api/session/:sessionId/spin` |

## signup.ts
> CORTI W206-ONBOARDING — customer self-serve signup route. POST   /api/signup       create tenant + trial license + send email POST   /api/signup/verify  flip a verification flag (mock; auto-yes in dev) GET    /api/signup/check-email?email=  is the email already taken No auth — this is the unauthenticated funnel entry. Rate-limit hook in admin.ts skips /api/signup (we add the prefix exemption below by registering BEFORE admin's preHandler runs against it — but admin also exemp
| Method | Path |
|---|---|
| `POST` | `/api/signup` |
| `POST` | `/api/signup/verify` |
| `GET` | `/api/signup/check-email` |

## wallet.ts
> CORTI 200.4-BACKEND — wallet endpoints (mock). GET  /api/wallet/:playerId/balance POST /api/wallet/:playerId/deposit POST /api/wallet/:playerId/withdraw GET  /api/wallet/:playerId/transactions
| Method | Path |
|---|---|
| `GET` | `/api/wallet/:playerId/balance` |
| `POST` | `/api/wallet/:playerId/deposit` |
| `POST` | `/api/wallet/:playerId/withdraw` |
| `GET` | `/api/wallet/:playerId/transactions` |
