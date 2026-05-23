
    import { runIRSimulation } from "/Users/vanvinklstudio/Projects/slot-math-engine-template/dist/engine/irSimulator.js";
    import { readFileSync } from 'node:fs';
    const ir = JSON.parse(readFileSync("/Users/vanvinklstudio/Projects/slot-math-engine-template/tests/fixtures/parity-base-only.json", 'utf-8'));
    const t0 = performance.now();
    const res = await runIRSimulation(ir, { spins: 100000000, seed: 42 });
    const wallMs = performance.now() - t0;
    process.stdout.write(JSON.stringify({
      n: res.spins,
      rtp: res.rtp,
      hitRate: res.hitRate,
      maxWinX: res.maxWinX,
      wallMs,
    }));
  