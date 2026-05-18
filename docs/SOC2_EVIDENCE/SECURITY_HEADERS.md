# Security Headers — SOC 2 Evidence

CORTI W206-SECURITY — Helmet-driven security header attachment for the
Fastify backend. Closes OWASP A05 high-severity finding
`a05-no-security-headers`.

Source of truth: `server/index.ts` (helmet plugin registration).

## Stack

- `@fastify/helmet` ^13.0.2 — wraps the canonical Helmet header set for
  Fastify with TS-typed options.
- Registered **before** route registration so every reply carries the
  headers regardless of code path.
- A second copy of HSTS / X-Frame-Options / X-Content-Type-Options /
  Referrer-Policy is attached at the nginx edge (defense-in-depth — see
  `docs/SOC2_EVIDENCE/TLS_CONFIG.md`).

## Per-header rationale

| Header | Value | OWASP / Standards reference | Rationale |
|--------|-------|----------------------------|-----------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'` | OWASP CSP Cheat Sheet | Tight allowlist; `object-src 'none'` kills Flash/PDF embed XSS; `form-action 'self'` prevents form hijacking. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | OWASP HSTS Cheat Sheet, RFC 6797 | 1-year HSTS with preload eligibility (matches `hstspreload.org` requirements). |
| `X-Frame-Options` | `SAMEORIGIN` | OWASP Clickjacking Cheat Sheet | Allow GaaS iframe embed on operator origin; deny cross-site framing. |
| `X-Content-Type-Options` | `nosniff` | OWASP Secure Headers | Disables MIME sniffing — blocks `text/plain` → `text/html` upgrade. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | OWASP Secure Headers | Leak the origin only, never the path; full URL on same-origin. |
| `Cross-Origin-Resource-Policy` | `same-site` | Fetch Metadata Spec | Block CORB-style cross-site reads of API responses. |
| `Cross-Origin-Embedder-Policy` | `disabled` | — | Intentionally disabled to allow GaaS iframe embeds on operator sites. Re-enable as `require-corp` when SharedArrayBuffer ships. |
| `Permitted-Cross-Domain-Policies` | `none` | Adobe Flash legacy | Defense against legacy crossdomain.xml lookups. |
| `X-Powered-By` | (removed) | OWASP Secure Headers | Fingerprinting hygiene. |

## CSP directive map

```
default-src 'self'
script-src  'self'                              # No inline scripts; ship nonces in W207
style-src   'self' 'unsafe-inline'              # SPA build tools inline critical CSS
img-src     'self' data: blob:                  # Pixel exports, generated charts
connect-src 'self'                              # WS upgrade hits same origin
font-src    'self' data:
object-src  'none'                              # Hard-disable <object>/<embed>
base-uri    'self'
frame-ancestors 'self'                          # Mirrors X-Frame-Options
form-action 'self'
```

The `'unsafe-inline'` on `style-src` is the only relaxation; planned
W207 work introduces nonces so it can be removed.

## Test coverage

`server/tests/security-headers.test.ts` — 9 specs:
1. CSP header present + contains `default-src 'self'`.
2. CSP forbids objects + locks `form-action`.
3. HSTS header with 1y max-age + preload.
4. `X-Frame-Options: SAMEORIGIN`.
5. `X-Content-Type-Options: nosniff`.
6. `Referrer-Policy: strict-origin-when-cross-origin`.
7. `X-Powered-By` removed.
8. Headers present across multiple endpoints (admin + lobby).
9. `Cross-Origin-Resource-Policy: same-site`.

## Verification commands

```bash
# Smoke
curl -sI http://localhost:4000/api/health | grep -E "(content-security|strict-transport|x-frame|x-content|referrer)"

# Mozilla observatory grade (target: A or A+)
curl -X POST "https://http-observatory.security.mozilla.org/api/v1/analyze?host=operator.example.com"
```

See also: `reports/security/OWASP_TOP_10_2026-05-18.md` → A05 (no
findings).
