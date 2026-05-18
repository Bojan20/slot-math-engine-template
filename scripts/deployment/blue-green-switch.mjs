#!/usr/bin/env node
/**
 * W210 Faza 600.0 — Atomic blue/green active switch.
 *
 * Swaps which environment is "active" in state.json. Idempotent — if
 * the requested env is already active, the script is a no-op. After
 * the swap, the previous active env is retained as the warm fallback
 * (used by rollback automation as the "previous deployment").
 *
 * Flags:
 *   --to=green|blue
 *   --dry-run
 */
import { parseArgs, loadState, saveState, log } from './_lib.mjs';

const args = parseArgs(process.argv);
const to = args.to ?? 'green';
if (to !== 'blue' && to !== 'green') {
  log(`invalid --to=${to}`);
  process.exit(2);
}
const dry = !!args['dry-run'];

const state = loadState();
if (state.active === to) {
  log(`active already ${to} (no-op)`);
  process.exit(0);
}
if (!state[to]?.healthy) {
  log(`refusing to switch to unhealthy env ${to}`);
  process.exit(3);
}
log(`switch active ${state.active} → ${to}`);
const next = { ...state, active: to };

if (dry) {
  log('dry-run — state not written');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(next, null, 2));
  process.exit(0);
}
saveState(next);
log('switch complete');
