#!/usr/bin/env node
// scripts/qa/validate-tag-version.mjs
// CI gate (release): the published git tag must equal `v<package.json version>`.
// Extracted from the publish-gpr workflow so the validation logic is testable and
// the workflow YAML stays under line-length limits.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = String(process.env.GITHUB_REF_NAME || '');
const expected = `v${pkg.version}`;
if (tag !== expected) {
  console.error(`Release tag must match package version. expected=${expected} actual=${tag}`);
  process.exit(1);
}