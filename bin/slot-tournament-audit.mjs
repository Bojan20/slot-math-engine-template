#!/usr/bin/env node
/**
 * slot-tournament-audit — W205+1 enterprise CLI shim for the W204
 * Tournament-Aware RTP Audit Pipeline.
 *
 * Wraps `buildTournamentAuditReport` + `emitTournamentAuditMarkdown / Json / Xml`
 * with a thin CLI surface so a regulator-grade audit report can be produced
 * outside of TypeScript-test land:
 *
 *   slot-tournament-audit                  → reads JSON from stdin, emits MD
 *   slot-tournament-audit --input cfg.json → reads from file, emits MD
 *   slot-tournament-audit --format json
 *   slot-tournament-audit --format xml --out report.xml
 *   slot-tournament-audit --help
 *
 * Exit codes:
 *   0 — report emitted, 0 compliance FAIL findings
 *   1 — report emitted, ≥ 1 compliance FAIL finding (CI gate hook)
 *   2 — usage / input-validation error
 *
 * The CLI never crashes on a malformed input — it surfaces the validation
 * error verbatim and exits 2 so a regulator-side pipeline can pin the
 * exact reason without parsing tracebacks.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HELP_TEXT = `slot-tournament-audit — regulator-grade tournament audit report builder

USAGE
  slot-tournament-audit [--input PATH] [--format FORMAT] [--out PATH] [--quiet]
  slot-tournament-audit --help
  slot-tournament-audit --version

OPTIONS
  --input PATH       Path to JSON config (TournamentAuditInput shape).
                     If omitted, reads JSON from stdin.
  --format FORMAT    Output format: md (default) | json | xml.
                     md  → UKGC/MGA regulator-friendly Markdown.
                     json → machine-readable, deterministic (CI gate).
                     xml  → urn:slotmath:tournament-audit:v1 namespace
                            (GLI/eCOGRA cert pipeline).
  --out PATH         Write output to file. Defaults to stdout.
  --quiet            Suppress non-essential stderr chatter.
  --strict           Exit 1 if ANY compliance finding is FAIL or WARN.
                     Without --strict, only FAIL exits 1.
  --help, -h         Show this help.
  --version, -v      Show version.

INPUT JSON SHAPE
  {
    "tournamentId":   "<string>",       // required
    "operator":       "UKGC",           // required
    "baseGameRtpTarget": 0.94,          // required, 0..1.1
    "prizeAllocation": { ... },         // W201 config (optional)
    "networkPool":     { ... },         // W202 config (optional)
    "betFairness":     { ... }          // W203 config (optional)
  }
  At least one of prizeAllocation / networkPool / betFairness is required.

EXAMPLES
  # Pipe a config into the CLI:
  cat my-tournament.json | slot-tournament-audit --format json

  # Audit + write Markdown deliverable for a regulator:
  slot-tournament-audit --input cfg.json --format md --out audit.md

  # CI gate: fail build if any compliance rule is FAIL:
  slot-tournament-audit --input cfg.json --format json > /dev/null

SEE ALSO
  src/cli/buildTournamentAuditReport.ts  — TS API + compliance rules.
  SLOTH_MASTER.md §PHASE 9               — W204 wave audit-pipeline details.
`;

function parseArgs(argv) {
  const opts = {
    input: null,
    format: 'md',
    out: null,
    quiet: false,
    strict: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help':
      case '-h':
        opts.help = true;
        break;
      case '--version':
      case '-v':
        opts.version = true;
        break;
      case '--input':
        opts.input = argv[++i];
        break;
      case '--format':
        opts.format = argv[++i];
        break;
      case '--out':
        opts.out = argv[++i];
        break;
      case '--quiet':
        opts.quiet = true;
        break;
      case '--strict':
        opts.strict = true;
        break;
      default:
        if (a.startsWith('--input=')) opts.input = a.slice(8);
        else if (a.startsWith('--format=')) opts.format = a.slice(9);
        else if (a.startsWith('--out=')) opts.out = a.slice(6);
        else
          throw new UsageError(`Unknown argument: ${a}\n${HELP_TEXT}`);
    }
  }
  if (!['md', 'json', 'xml'].includes(opts.format)) {
    throw new UsageError(`--format must be md|json|xml, got "${opts.format}"`);
  }
  return opts;
}

class UsageError extends Error {}

async function readInput(opts) {
  if (opts.input) {
    const p = resolve(opts.input);
    if (!existsSync(p)) {
      throw new UsageError(`--input file not found: ${p}`);
    }
    return JSON.parse(readFileSync(p, 'utf-8'));
  }
  // stdin
  if (process.stdin.isTTY) {
    throw new UsageError(
      'No --input file and stdin is a TTY. Pipe a JSON config or use --input PATH.',
    );
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) {
    throw new UsageError('Empty stdin — no JSON config to audit.');
  }
  return JSON.parse(raw);
}

async function loadModule() {
  // Prefer the built dist/ artefacts so the CLI works in a published package
  // without requiring tsx / ts-node at the deploy site. Falls back to source
  // for in-repo runs where dist/ is regenerated on every test.
  const candidates = [
    resolve(__dirname, '../dist/cli/buildTournamentAuditReport.js'),
    resolve(process.cwd(), 'dist/cli/buildTournamentAuditReport.js'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return import(c);
  }
  throw new UsageError(
    'dist/cli/buildTournamentAuditReport.js not found. Run `npm run build` first.',
  );
}

async function main() {
  const argv = process.argv.slice(2);
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }

  if (opts.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }
  if (opts.version) {
    // Read version from package.json so we stay in sync.
    const pkgPath = resolve(__dirname, '../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    process.stdout.write(`slot-tournament-audit ${pkg.version}\n`);
    process.exit(0);
  }

  let input;
  try {
    input = await readInput(opts);
  } catch (e) {
    process.stderr.write(`Input error: ${e.message}\n`);
    process.exit(2);
  }

  let mod;
  try {
    mod = await loadModule();
  } catch (e) {
    process.stderr.write(`Module load error: ${e.message}\n`);
    process.exit(2);
  }

  let report;
  try {
    report = mod.buildTournamentAuditReport(input);
  } catch (e) {
    process.stderr.write(`Audit build failed: ${e.message}\n`);
    process.exit(2);
  }

  // Emit in chosen format.
  let body;
  switch (opts.format) {
    case 'md':
      body = mod.emitTournamentAuditMarkdown(report);
      break;
    case 'json':
      body = mod.emitTournamentAuditJson(report);
      break;
    case 'xml':
      body = mod.emitTournamentAuditXml(report);
      break;
  }

  if (opts.out) {
    writeFileSync(resolve(opts.out), body, 'utf-8');
    if (!opts.quiet) {
      process.stderr.write(`Audit report written to ${opts.out}\n`);
    }
  } else {
    process.stdout.write(body);
    if (!body.endsWith('\n')) process.stdout.write('\n');
  }

  // Compute exit code from compliance findings.
  const findings = report.complianceFindings ?? [];
  const failCount = findings.filter((f) => f.status === 'fail').length;
  const warnCount = findings.filter((f) => f.status === 'warn').length;
  if (!opts.quiet) {
    process.stderr.write(
      `Compliance: ${findings.length - failCount - warnCount} pass · ${warnCount} warn · ${failCount} fail\n`,
    );
  }
  if (failCount > 0 || (opts.strict && warnCount > 0)) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e?.stack ?? e?.message ?? String(e)}\n`);
  process.exit(2);
});
