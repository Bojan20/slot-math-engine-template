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
  auditLog.write(JSON.stringify({ ts: Date.now(), ...event }) + '\n');
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
