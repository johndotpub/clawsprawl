#!/usr/bin/env node
// scripts/qa/validate-package-scope.mjs
// CI gate: the package.json `name` must be scoped for GitHub Packages
// (e.g. `@<owner>/clawsprawl`). Extracted from the publish-gpr workflow so the
// validation logic is testable and the workflow YAML stays under line-length limits.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const owner = (process.env.GITHUB_REPOSITORY_OWNER || '').toLowerCase();
if (!owner) {
  console.error('GITHUB_REPOSITORY_OWNER is missing');
  process.exit(1);
}
const expected = `@${owner}/`;
if (!pkg.name || !pkg.name.toLowerCase().startsWith(expected)) {
  console.error(
    `package.json name must be scoped for GitHub Packages. Expected prefix: ${expected} (current: ${String(pkg.name)})`,
  );
  process.exit(1);
}