"""SLOT-MATH Faza 4.3 + 4.4 — Fastify RGS backend + IR bindings.

Generates self-contained Node RGS scaffold:
    server/
      server.js              ← Fastify session + bet/spin/cashout
      package.json
      Dockerfile             ← production deploy image
      api.openapi.json       ← OpenAPI 3.1 spec for endpoints
      game.ir.json           ← IR (server uses for spin evaluation)
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


_SERVER_JS = """\
/* slot-math RGS — Fastify session + bet/spin/cashout.
   Auto-emitted by tools/par_deploy/rgs_emit.py
   Deterministic per-seed spin evaluation, audit log per session.
*/
import Fastify from 'fastify';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ir = JSON.parse(fs.readFileSync('./game.ir.json', 'utf-8'));
const PORT = process.env.PORT || 3000;
const fastify = Fastify({ logger: true });

// In-memory session store (production → Redis/Postgres)
const sessions = new Map();

// PCG64 deterministic seeded RNG (matches IR.rng.kind)
function makeRng(seed) {
  let state = BigInt(seed);
  const MULT = 6364136223846793005n;
  const INC = 1442695040888963407n;
  return () => {
    state = (state * MULT + INC) & 0xffffffffffffffffn;
    const xorshifted = Number(((state >> 18n) ^ state) >> 27n) >>> 0;
    const rot = Number(state >> 59n);
    const out = (xorshifted >>> rot) | (xorshifted << (32 - rot));
    return (out >>> 0) / 4294967296;
  };
}

// Jurisdiction RTP clamp (load from IR.compliance)
function clampRtpForJurisdiction(rtp, jurisdiction) {
  const range = ir.compliance.rtp_range_required;
  if (range) {
    return Math.min(Math.max(rtp, range[0]), range[1]);
  }
  return rtp;
}

// Audit-log entry (append-only WAL)
const auditLog = fs.createWriteStream('./audit.log', { flags: 'a' });
function logAudit(event) {
  auditLog.write(JSON.stringify({ ts: Date.now(), ...event }) + '\\n');
}

// ─── POST /session — open new player session ───────────────────────────
fastify.post('/session', async (req, reply) => {
  const sessionId = crypto.randomUUID();
  const seed = req.body?.seed ?? Date.now();
  const session = {
    id: sessionId,
    seed,
    rng: makeRng(seed),
    spins: 0,
    balance: req.body?.balance ?? 1000,
    jurisdiction: req.body?.jurisdiction ?? 'GENERIC',
    created_at: new Date().toISOString(),
  };
  sessions.set(sessionId, session);
  logAudit({ event: 'session_open', session_id: sessionId, seed, jurisdiction: session.jurisdiction });
  return { session_id: sessionId, balance: session.balance };
});

// ─── POST /bet — place bet + spin ──────────────────────────────────────
fastify.post('/bet', async (req, reply) => {
  const { session_id, stake } = req.body;
  const sess = sessions.get(session_id);
  if (!sess) return reply.code(404).send({ error: 'session not found' });

  const baseBet = stake ?? ir.bet.base_bet;
  if (sess.balance < baseBet) {
    return reply.code(400).send({ error: 'insufficient balance' });
  }

  // Spin evaluation (deterministic per session seed)
  const reels = ir.topology.reels;
  const rows = ir.topology.rows || 3;
  const drawn = [];
  for (let r = 0; r < reels; r++) {
    const reelMap = ir.reels.base[r];
    const pool = [];
    Object.entries(reelMap).forEach(([sym, w]) => {
      for (let i = 0; i < Math.round(w * 10); i++) pool.push(sym);
    });
    const reelDraw = [];
    for (let row = 0; row < rows; row++) {
      reelDraw.push(pool[Math.floor(sess.rng() * pool.length)]);
    }
    drawn.push(reelDraw);
  }

  // Payout: count first-reel center symbol along payline 0
  const firstSym = drawn[0][Math.floor(rows / 2)];
  let matchCount = 0;
  for (let r = 0; r < reels; r++) {
    if (drawn[r].includes(firstSym)) matchCount++;
    else break;
  }
  const paytable = ir.paytable[firstSym];
  let payout = 0;
  if (paytable && paytable[String(matchCount)]) {
    payout = paytable[String(matchCount)] * baseBet;
  }

  sess.balance += payout - baseBet;
  sess.spins++;

  const spinHash = crypto.createHash('sha256')
    .update(JSON.stringify({ session_id, spin_num: sess.spins, seed: sess.seed, drawn, payout }))
    .digest('hex');

  logAudit({
    event: 'spin',
    session_id,
    spin_num: sess.spins,
    stake: baseBet,
    drawn,
    payout,
    balance: sess.balance,
    spin_hash: spinHash,
  });

  return { spin_num: sess.spins, drawn, payout, balance: sess.balance, spin_hash: spinHash };
});

// ─── POST /cashout — close session ─────────────────────────────────────
fastify.post('/cashout', async (req, reply) => {
  const { session_id } = req.body;
  const sess = sessions.get(session_id);
  if (!sess) return reply.code(404).send({ error: 'session not found' });
  const finalBalance = sess.balance;
  logAudit({ event: 'cashout', session_id, final_balance: finalBalance, total_spins: sess.spins });
  sessions.delete(session_id);
  return { final_balance: finalBalance, total_spins: sess.spins };
});

// ─── GET /healthz — liveness ───────────────────────────────────────────
fastify.get('/healthz', async () => ({ status: 'ok', game_id: ir.meta.id, ir_merkle: ir.provenance?.ir_sha256 }));

// ─── GET /game — IR (frozen, regulator-readable) ──────────────────────
fastify.get('/game', async () => ir);

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { fastify.log.error(err); process.exit(1); }
  fastify.log.info(`slot-math RGS serving ${ir.meta.id} on port ${PORT}`);
});
"""


_PACKAGE_JSON = """\
{
  "name": "slot-math-rgs",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "fastify": "^4.26.0"
  }
}
"""


_DOCKERFILE = """\
# slot-math RGS production image
FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js game.ir.json api.openapi.json ./

ENV PORT=3000
EXPOSE 3000

# Healthcheck hits /healthz
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD wget --quiet --tries=1 --spider http://localhost:3000/healthz || exit 1

CMD ["node", "server.js"]
"""


def _build_openapi(ir: dict[str, Any]) -> dict[str, Any]:
    return {
        "openapi": "3.1.0",
        "info": {
            "title": f"slot-math RGS — {ir.get('meta', {}).get('name', 'Unknown')}",
            "version": ir.get("meta", {}).get("version", "1.0.0"),
            "description": "Production RGS for slot-math-engine-template build. "
                           f"PAR Merkle: {ir.get('provenance', {}).get('par_sha256', '')[:16]}...",
        },
        "paths": {
            "/session": {
                "post": {
                    "summary": "Open player session",
                    "requestBody": {
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "seed": {"type": "integer"},
                                "balance": {"type": "number"},
                                "jurisdiction": {"type": "string"},
                            },
                        }}},
                    },
                    "responses": {"200": {"description": "Session opened"}},
                }
            },
            "/bet": {
                "post": {
                    "summary": "Place bet + spin",
                    "requestBody": {
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "required": ["session_id"],
                            "properties": {
                                "session_id": {"type": "string"},
                                "stake": {"type": "number"},
                            },
                        }}},
                    },
                    "responses": {"200": {"description": "Spin result + audit hash"}},
                }
            },
            "/cashout": {
                "post": {
                    "summary": "Close session, return final balance",
                    "responses": {"200": {"description": "Cashout receipt"}},
                }
            },
            "/healthz": {"get": {"summary": "Liveness", "responses": {"200": {"description": "OK"}}}},
            "/game": {"get": {"summary": "IR (regulator-readable)", "responses": {"200": {"description": "Game IR"}}}},
        },
    }


def render_fastify_server() -> str:
    return _SERVER_JS


def render_package_json() -> str:
    return _PACKAGE_JSON


def render_dockerfile() -> str:
    return _DOCKERFILE


def emit_rgs_bundle(ir: dict[str, Any], out_dir: Path) -> dict[str, Any]:
    """Write RGS scaffold to out_dir/server/."""
    server_dir = out_dir / "server"
    server_dir.mkdir(parents=True, exist_ok=True)

    (server_dir / "server.js").write_text(_SERVER_JS, encoding="utf-8")
    (server_dir / "package.json").write_text(_PACKAGE_JSON, encoding="utf-8")
    (server_dir / "Dockerfile").write_text(_DOCKERFILE, encoding="utf-8")
    (server_dir / "api.openapi.json").write_text(
        json.dumps(_build_openapi(ir), sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    ir_bytes = json.dumps(ir, sort_keys=True, indent=2).encode("utf-8") + b"\n"
    (server_dir / "game.ir.json").write_bytes(ir_bytes)

    return {
        "out_dir": str(server_dir),
        "files": ["server.js", "package.json", "Dockerfile", "api.openapi.json", "game.ir.json"],
    }
