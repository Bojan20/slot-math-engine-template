# Auto-generated API routes

Generated from `server/routes/*.ts` by `scripts/generate-api-docs.mjs`. 
Captures 90 routes across 19 route files. 
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

## chaos.ts
> W212 Faza 600.1 — Admin chaos UI endpoint. GET    /api/admin/chaos        → list active faults POST   /api/admin/chaos/enable → { name, probability } POST   /api/admin/chaos/disable→ { name } | { all: true } POST   /api/admin/chaos/reset  → reset counters Always env-gated: when `CHAOS_ENABLED !== 'true'` or `NODE_ENV === 'production'`, every mutating call returns 403. The GET works either way so dashboards can render an empty state without 403'ing. Admin RBAC enforced via the
| Method | Path |
|---|---|
| `GET` | `/api/admin/chaos` |
| `POST` | `/api/admin/chaos/enable` |
| `POST` | `/api/admin/chaos/disable` |
| `POST` | `/api/admin/chaos/reset` |

## csm.ts
> W215 Faza 1300.0 Agent C — Customer Success Manager (CSM) routes. Wires the 5 CSM-operations stores under three top-level paths: /api/csm/customers/...   onboarding tracker /api/support/tickets/... support tickets (tenant-scoped) /api/csm/nps/...         NPS survey /api/csm/churn-risk      churn-risk scorer Admin endpoints require `isAdmin(req)` → true. Tenant-scoped endpoints require a `req.tenantId` set by the W208 tenant-isolation pre-handler (caller injects it for unit te
| Method | Path |
|---|---|
| `POST` | `/api/csm/customers` |
| `GET` | `/api/csm/customers` |
| `GET` | `/api/csm/customers/:id` |
| `POST` | `/api/csm/customers/:id/transition` |
| `POST` | `/api/support/tickets` |
| `GET` | `/api/support/tickets` |
| `GET` | `/api/support/tickets/:id` |
| `PATCH` | `/api/support/tickets/:id` |
| `POST` | `/api/support/tickets/:id/comment` |
| `POST` | `/api/csm/nps/send` |
| `GET` | `/api/csm/nps/responses` |
| `POST` | `/api/csm/nps/responses` |

## csp-report.ts
> W212 Faza 600.1 — CSP violation report endpoint. POST /api/csp-report Browsers POST `application/csp-report` JSON when a CSP directive (whose `report-uri` points at this endpoint) is violated. We log the event at WARN severity and append a sanitised record to `reports/security/csp-violations.json` for later forensics. Public (no RBAC) by design — browsers can't add headers. Body is length-capped and any field longer than 2 KB is truncated.
| Method | Path |
|---|---|
| `POST` | `/api/csp-report` |

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

## marketing-events.ts
> W215 Faza 800.2 Agent C — Marketing analytics event routes. POST  /api/marketing/event                       insert event batch (public, rate-limited) GET   /api/marketing/analytics/funnel            funnel JSON (admin) GET   /api/marketing/analytics/ab/:experimentId  A/B experiment results (admin) GET   /api/marketing/analytics/pageviews         pageviews breakdown (admin) Public POST accepts {sessionId, events:[…]} or {events:[…]} (each event carries its own sessionId). Reu
| Method | Path |
|---|---|
| `POST` | `/api/marketing/event` |
| `GET` | `/api/marketing/analytics/funnel` |
| `GET` | `/api/marketing/analytics/pageviews` |
| `GET` | `/api/marketing/analytics/ab/:experimentId` |

## marketing-leads.ts
> W214 Faza 800.1 Agent C — Public marketing site lead capture route. POST  /api/marketing/lead              insert a new lead (public, rate-limited) GET   /api/marketing/lead/:id          fetch by id (admin) POST  /api/marketing/lead/:id/sent     mark tarball as delivered (admin) GET   /api/marketing/leads             list w/ filters (admin) The POST is the unauthenticated entry the marketing site form posts to. It enforces: * required fields + email regex * honeypot (silent d
| Method | Path |
|---|---|
| `POST` | `/api/marketing/lead` |
| `GET` | `/api/marketing/lead/:id` |
| `POST` | `/api/marketing/lead/:id/sent` |
| `GET` | `/api/marketing/leads` |

## marketplace.ts
> CORTI W209 Faza 500.0 — Marketplace REST API. All routes mounted under `/api/marketplace`. Tenant-scoped where applicable (purchases / list-mine / refund), public for catalogue reads (list kernels + templates + author profile). Author-only endpoints (kernel submission, payout method, earnings) gated by `X-Author-Key` via {@link authorAuthPreHandler}. Routes follow the same JSON response shape as the rest of the backend — every error returns `{ error: <code>, ... }` with the a
| Method | Path |
|---|---|
| `GET` | `/api/marketplace/kernels` |
| `GET` | `/api/marketplace/kernels/:id` |
| `POST` | `/api/marketplace/kernels/:id/run-gates` |
| `POST` | `/api/marketplace/kernels/:id/approve` |
| `POST` | `/api/marketplace/kernels/:id/reject` |
| `GET` | `/api/marketplace/templates` |
| `GET` | `/api/marketplace/templates/:id` |
| `POST` | `/api/marketplace/purchase` |
| `GET` | `/api/marketplace/purchases` |
| `POST` | `/api/marketplace/purchase/:id/refund` |
| `POST` | `/api/marketplace/authors/register` |
| `GET` | `/api/marketplace/authors/:id` |
| `POST` | `/api/marketplace/authors/me/payout-method` |
| `GET` | `/api/marketplace/authors/me/earnings` |
| `POST` | `/api/marketplace/license/verify` |
| `POST` | `/api/marketplace/webhooks/payment` |

## pilot.ts
> W211 Faza 700.0 — Real L&W Pilot Onboard — pilot run REST routes. POST /api/pilot/runs       — admin record a new run (called by CI / the integration-suite script). GET  /api/pilot/runs       — admin list runs (filter ?tenant=&ok=) GET  /api/pilot/runs/:id   — per-run detail The store backing these routes is either the in-memory PilotRunStore or the Postgres-backed PostgresPilotRunStore. Both expose the same record() / get() / list() API, so the route layer treats them as a c
| Method | Path |
|---|---|
| `POST` | `/api/pilot/runs` |
| `GET` | `/api/pilot/runs` |
| `GET` | `/api/pilot/runs/:id` |

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

## wallet-healthcheck.ts
> W210 Faza 600.0 — wallet provider healthcheck endpoint. POST /api/wallet/healthcheck — runs (or fetches cached) provider health for every configured tenant and returns the aggregate.
| Method | Path |
|---|---|
| `POST` | `/api/wallet/healthcheck` |

## wallet.ts
> CORTI 200.4-BACKEND — wallet endpoints (mock). GET  /api/wallet/:playerId/balance POST /api/wallet/:playerId/deposit POST /api/wallet/:playerId/withdraw GET  /api/wallet/:playerId/transactions
| Method | Path |
|---|---|
| `GET` | `/api/wallet/:playerId/balance` |
| `POST` | `/api/wallet/:playerId/deposit` |
| `POST` | `/api/wallet/:playerId/withdraw` |
| `GET` | `/api/wallet/:playerId/transactions` |
