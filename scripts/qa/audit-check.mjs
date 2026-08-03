#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/qa/audit-check.mjs
//
// Dependency security audit enforcement.
//
// Runs `npm audit --json` and fails the process if any vulnerabilities at or
// above the configured audit level are present. This is the single source of
// truth used by:
//
//   - the vitest suite (tests/security/audit.test.ts) so every `npm test`
//     run enforces a clean dependency tree locally, and
//   - CI (ci.yml / security.yml) so every commit is gated on it.
//
// Defaults to a FULL audit (production + development dependencies) at the
// `moderate` level — the strongest guarantee and the state the project ships
// in. Narrow it with `--omit=dev` for a production-only check.
//
// Exit codes:
//   0 — no vulnerabilities at/above the level
//   1 — vulnerabilities found (fails the gate)
//   2 — could not run the audit (registry/network error) — treated as a skip
//       by the test harness so local offline runs don't false-fail; CI is the
//       hard gate.
//
// Usage:
//   node scripts/qa/audit-check.mjs
//   node scripts/qa/audit-check.mjs --omit=dev --audit-level=high
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);

let omitDev = false;
let level = 'moderate';
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--omit=dev') omitDev = true;
  else if (a.startsWith('--audit-level=')) level = a.slice('--audit-level='.length);
  else if (a === '--help' || a === '-h') {
    console.log(`usage: node scripts/qa/audit-check.mjs [--omit=dev] [--audit-level=<info|low|moderate|high|critical>]`);
    process.exit(0);
  }
}

const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const levelRank = severityRank[level] ?? severityRank.moderate;

const npmArgs = ['audit', '--json'];
if (omitDev) npmArgs.push('--omit=dev');
npmArgs.push(`--audit-level=${level}`);

const res = spawnSync('npm', npmArgs, {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

let audit;
try {
  audit = JSON.parse(res.stdout ?? '');
} catch {
  // No parseable JSON — almost always a registry/network error.
  console.error('audit-check: could not parse `npm audit --json` output.');
  if (res.stderr) console.error(res.stderr.trim());
  process.exit(2);
}

// npm may emit a JSON error object (e.g. registry unreachable) with no metadata.
if (!audit.metadata && audit.error) {
  console.error(`audit-check: npm audit error — ${audit.error.code ?? 'unknown'}: ${audit.error.summary ?? ''}`);
  process.exit(2);
}

const meta = audit.metadata?.vulnerabilities ?? {};
const countsBySeverity = Object.entries(meta).filter(([k]) => k !== 'total');
const atLevel = countsBySeverity
  .filter(([sev]) => (severityRank[sev] ?? 0) >= levelRank)
  .reduce((sum, [, n]) => sum + (n ?? 0), 0);

if (atLevel > 0) {
  const scope = omitDev ? 'production deps' : 'production + dev deps';
  console.error(`\naudit-check: ${atLevel} vulnerabilities at/above "${level}" found (${scope}).\n`);
  const vulns = audit.vulnerabilities ?? {};
  for (const [name, info] of Object.entries(vulns)) {
    const sev = info.severity ?? 'unknown';
    if ((severityRank[sev] ?? 0) < levelRank) continue;
    const via = (info.via ?? [])
      .map((v) => (typeof v === 'string' ? v : v.title || v.name || v.source))
      .filter(Boolean)
      .join('; ');
    console.error(`  • ${name}@${info.range ?? '?'} [${sev}] — ${via || 'no advisory detail'}`);
    if (info.fixAvailable) {
      console.error('    fix available: `npm audit fix` or add/adjust `overrides` in package.json');
    }
  }
  console.error('\nRun `npm audit` for the full report.');
  process.exit(1);
}

const scope = omitDev ? 'production deps' : 'production + dev deps';
console.log(`audit-check: 0 vulnerabilities at/above "${level}" (${scope}).`);
process.exit(0);