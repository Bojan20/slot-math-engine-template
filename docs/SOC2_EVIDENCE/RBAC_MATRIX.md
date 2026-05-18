# RBAC Matrix — SOC 2 Evidence

CORTI W206-SECURITY — Role-Based Access Control evidence collection for
the SOC 2 Type 1 audit. Maps each HTTP endpoint to the minimum required
role and the permission token enforced by middleware.

Source of truth:
- `server/state/rbac.ts` — Role enum, weight table, permission matrix,
  `requireRole` / `requirePermission` middleware
- `server/state/users.ts` — `userId → role` mapping (in-memory)
- Per-route guards: `server/routes/*.ts`

## Role hierarchy

| Role        | Weight | Inherits from               | Description |
|-------------|:------:|-----------------------------|-------------|
| admin       | 4      | operator, regulator, player, guest | Full CRUD on tenants, system config, audit. |
| operator    | 3      | player, guest               | Game library CRUD, MC runs, cert submission, RTP monitoring. |
| regulator   | 2      | guest                       | Read-only audit, approve/reject cert submissions. |
| player      | 1      | guest                       | Wallet ops on OWN wallet, spin, session. |
| guest       | 0      | —                           | Limited preview (game list, health only). |

Note: regulator and operator are **peer privileges**, not stacked.
Endpoints that require cross-cutting decisions (cert approve/reject)
use **permission-based** guards (`requirePermission('cert:approve')`)
rather than the numeric weight check.

## Endpoint × role matrix

| Method | Endpoint                                  | Guard                                  | Required role | Notes |
|:------:|-------------------------------------------|----------------------------------------|---------------|-------|
| GET    | `/api/admin/tenants`                      | `requireRole('admin')`                 | admin         | Tenant CRUD |
| POST   | `/api/admin/tenants`                      | `requireRole('admin')`                 | admin         | |
| GET    | `/api/admin/tenants/:id`                  | `requireRole('admin')`                 | admin         | |
| PATCH  | `/api/admin/tenants/:id`                  | `requireRole('admin')`                 | admin         | |
| DELETE | `/api/admin/tenants/:id`                  | `requireRole('admin')`                 | admin         | |
| POST   | `/api/session/create`                     | `requireRole('player')`                | player+       | |
| GET    | `/api/session/:sessionId`                 | `requireRole('player')`                | player+       | |
| DELETE | `/api/session/:sessionId`                 | `requireRole('player')`                | player+       | |
| POST   | `/api/session/:sessionId/spin`            | `requireRole('player')`                | player+       | |
| GET    | `/api/wallet/:playerId/balance`           | `requireRole('player')`                | player+       | own-wallet enforcement upcoming |
| POST   | `/api/wallet/:playerId/deposit`           | `requireRole('player')`                | player+       | |
| POST   | `/api/wallet/:playerId/withdraw`          | `requireRole('player')`                | player+       | |
| GET    | `/api/wallet/:playerId/transactions`      | `requireRole('player')`                | player+       | |
| GET    | `/api/lobby/games`                        | — (guest OK)                           | guest         | Public game list |
| POST   | `/api/lobby/launch`                       | `requireRole('player')`                | player+       | |
| POST   | `/api/audit/append`                       | `requireRole('operator')`              | operator+     | |
| GET    | `/api/audit/:sessionId`                   | `requireRole('regulator')`             | regulator+    | Read-only audit |
| GET    | `/api/audit/replay/:auditId`              | `requireRole('regulator')`             | regulator+    | |
| POST   | `/api/cert/submit`                        | `requireRole('operator')`              | operator+     | |
| GET    | `/api/cert/:submissionId`                 | — (guest OK)                           | guest         | Status read |
| GET    | `/api/cert/:submissionId/download`        | — (guest OK)                           | guest         | Op-pkg ZIP |
| GET    | `/api/cert/:submissionId/par.pdf`         | — (guest OK)                           | guest         | PAR PDF |
| GET    | `/api/cert/:submissionId/verify-signature`| — (guest OK)                           | guest         | Public verify |
| POST   | `/api/cert/:submissionId/approve` **NEW** | `requirePermission('cert:approve')`    | regulator, admin | W206 |
| POST   | `/api/cert/:submissionId/reject`  **NEW** | `requirePermission('cert:reject')`     | regulator, admin | W206 |
| GET    | `/api/health`, `/api/metrics`             | — (no auth, k8s probes)                | n/a           | Bypass |

## Audit-trail of escalation attempts

Every failed `requireRole` / `requirePermission` check is appended to the
in-process `escalationLog` ring buffer (capacity 1024). Each event
captures:
- `attemptedAt` (ISO timestamp)
- `callerRole` (or `'unknown'` when no header)
- `requiredRole` or `requiredPermission`
- `url`, `method`, optional `userId`

In production this sink will fan out to the AuditStore + Prometheus
alerts; the in-memory buffer is sufficient for SOC 2 Type 1 evidence.

## Test coverage

`server/tests/rbac.test.ts` — 25 specs covering:
- Role enum + weight ordering
- Permission inheritance (admin → operator → player → guest)
- `parseRoleHeader` parsing
- `EscalationLog` ring buffer semantics
- End-to-end `app.inject()` matrix across admin / cert / wallet routes
- `UserStore` upsert + seed

See also: `reports/security/OWASP_TOP_10_2026-05-18.md` → A01 finding
`a01-rbac-enforced` (Info — closed).
