import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, '..', '..', 'scripts', 'qa', 'audit-check.mjs');

/**
 * Dependency security audit enforcement.
 *
 * Runs `scripts/qa/audit-check.mjs`, which shells out to `npm audit --json` and
 * fails if any vulnerabilities at/above `moderate` are present across the FULL
 * dependency tree (production + development). This keeps every commit gated on
 * a clean audit locally — not just in CI — so a contributor cannot land a
 * change that reintroduces a known advisory without `npm test` failing.
 *
 * Exit codes from the script:
 *   0 — clean (no vulnerabilities at/above the level)
 *   1 — vulnerabilities found (hard fail)
 *   2 — could not run the audit (registry/network unreachable) — skipped here
 *       so an offline local run does not false-fail; CI is the authoritative gate.
 */
describe('dependency security audit', () => {
  it('has no vulnerabilities at/above moderate (production + dev)', () => {
    const res = spawnSync('node', [script], {
      encoding: 'utf8',
      timeout: 120_000,
    });

    if (res.status === 2) {
      // Registry/network unreachable — skip locally; CI enforces this hard.
      console.warn(`audit-check skipped (could not reach registry):\n${res.stderr ?? res.stdout}`);
      return;
    }

    const detail = (res.stdout || '') + (res.stderr ? `\n${res.stderr}` : '');
    expect(res.status, detail).toBe(0);
  }, 130_000);
});