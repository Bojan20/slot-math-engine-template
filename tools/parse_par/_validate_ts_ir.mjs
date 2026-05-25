/**
 * W5.3 — TS IR validator for `tools/parse_par/to_ts_ir.py` output.
 *
 * Reads a JSON file via argv[2] (or stdin if "-"), validates against
 * `SlotGameIRZ` Zod schema, prints a one-line OK summary on success or a
 * structured error block + exit 1 on failure.
 *
 * Used by:
 *   - `slot-build --codegen-ts <DIR>` (W5.3) — fail-fast gate after codegen
 *   - `tools/tests/test_w5_3_codegen_ts.py` — round-trip test from Python
 */
import { readFileSync } from 'node:fs';
import { SlotGameIRZ } from '../../src/ir/schema.ts';

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: tsx _validate_ts_ir.mjs <path|->');
    process.exit(2);
  }
  const text = arg === '-' ? readFileSync(0, 'utf-8') : readFileSync(arg, 'utf-8');
  const ir = JSON.parse(text);
  const result = SlotGameIRZ.safeParse(ir);
  if (result.success) {
    const d = result.data;
    console.log(`✅ valid SlotGameIR  schema=${d.schema_version}  name=${JSON.stringify(d.meta.name)}  topology=${d.topology.kind}  symbols=${d.symbols.length}  features=${d.features.length}  paytable_syms=${Object.keys(d.paytable).length}`);
    process.exit(0);
  } else {
    console.error(`❌ INVALID SlotGameIR`);
    for (const issue of result.error.issues.slice(0, 8)) {
      console.error(`  · ${issue.path.join('.')}: ${issue.message}`);
    }
    if (result.error.issues.length > 8) {
      console.error(`  · ... +${result.error.issues.length - 8} more`);
    }
    process.exit(1);
  }
}

main();
