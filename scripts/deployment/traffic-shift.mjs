#!/usr/bin/env node
/**
 * W210 Faza 600.0 — Gradual traffic shift blue → green.
 *
 * Increments green trafficPercent in `--step` increments separated by
 * `--interval` milliseconds. Default: 10% per minute. In `--dry-run`
 * mode the plan is printed and state is not mutated. In normal mode
 * each step is committed to state.json so the operation is resumable.
 */
import { parseArgs, loadState, saveState, log } from './_lib.mjs';

const args = parseArgs(process.argv);
const step = Number.parseInt(args.step ?? '10', 10);
const interval = Number.parseInt(args.interval ?? '60000', 10);
const target = Number.parseInt(args.target ?? '100', 10);
const dry = !!args['dry-run'];
const fast = !!args.fast; // shortcut for tests

let state = loadState();
if (!state.green.version) {
  log('no green prepared — refusing to shift traffic');
  process.exit(2);
}

log(
  `traffic shift: ${state.green.trafficPercent ?? 0}% → ${target}% in ${step}% steps every ${interval}ms`
);

while ((state.green.trafficPercent ?? 0) < target) {
  const next = Math.min(target, (state.green.trafficPercent ?? 0) + step);
  log(`step → green=${next}% blue=${100 - next}%`);
  if (!dry) {
    state = saveState({
      ...state,
      green: { ...state.green, trafficPercent: next },
    });
  } else {
    state = { ...state, green: { ...state.green, trafficPercent: next } };
  }
  if (!dry && !fast && next < target) {
    await new Promise((r) => setTimeout(r, interval));
  }
}

log('traffic shift complete');
