"""W5.1 — `slot-build` CLI: one-shot PAR/GDD → IR pipeline.

Driver for the universal slot-math pipeline. Reads any supported input
format (vendor PAR Excel/TSV dump, future GDD PDF), dispatches to the
right parser + adapter, and emits both vendor-shaped IR and universal
`slot-sim` IR. Optional MC sanity run validates the result.

CLI:
    python -m tools.slot_build <input_dir>
                               [--vendor <lw|igt|auto>]
                               [--sheet <name>]
                               [--all-sheets]
                               [--out <dir>]
                               [--mc-spins <n>]
                               [--bet-mult <m>]
                               [--seed <s>]
                               [--no-mc]
                               [--no-universal]
                               [--quiet]
"""
