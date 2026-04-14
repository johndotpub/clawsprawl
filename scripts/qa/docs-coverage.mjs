import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const docs = {
  readme: await read('README.md'),
  design: await read('docs/technical-design-plan.md'),
  heredoc: await read('docs/heredoc-api-sourcecode.md'),
  extensions: await read('docs/extensions.md'),
  runbook: await read('docs/operations-runbook.md'),
  changelog: await read('CHANGELOG.md'),
  versioning: await read('VERSIONING.md'),
  security: await read('SECURITY.md'),
  agents: await read('AGENTS.md'),
};

const requiredChecks = [
  ['README documents SSR architecture', docs.readme.includes('## Architecture')],
  ['README documents server-side auth model', docs.readme.includes('## Auth Model')],
  ['README documents profile configuration', docs.readme.includes('## Profile Configuration')],
  ['README documents strict QA command', docs.readme.includes('npm run qa:strict')],
  ['Design doc includes data flow section', docs.design.includes('Data flow:')],
  ['Design doc documents server-side token handling', docs.design.includes('OPENCLAW_GATEWAY_TOKEN')],
  ['Runbook includes incident dashboard flow', docs.runbook.includes('Incident dashboard flow')],
  ['Runbook includes health endpoint guidance', docs.runbook.includes('/api/private/health.json')],
  ['Heredoc doc includes executable heredoc example', docs.heredoc.includes("cat <<'EOF'")],
  ['Heredoc doc includes gateway client source anchor', docs.heredoc.includes('src/lib/gateway/client.ts')],
  ['Extensions doc includes extension checklist', docs.extensions.includes('## Extension Checklist')],
  ['Extensions doc references strict QA', docs.extensions.includes('npm run qa:strict')],
  ['Security policy includes vulnerability reporting instructions', docs.security.includes('Reporting a Vulnerability')],
  ['Agent conventions require strict QA pass', docs.agents.includes('npm run qa:strict')],
  ['Changelog includes public 0.42.0 baseline release notes', docs.changelog.includes('## [0.42.0]')],
  ['Versioning includes 0.42.0 public baseline mapping', docs.versioning.includes('0.42.0')],
];

const informationalChecks = [
  ['README includes docs screenshot command', docs.readme.includes('npm run docs:screenshots')],
  ['Runbook includes metrics endpoint notes', docs.runbook.includes('/metrics')],
  ['Versioning includes release workflow section', docs.versioning.includes('## Release Workflow')],
  ['Design doc includes reliability targets', docs.design.includes('## Reliability')],
];

const requiredPassed = requiredChecks.filter(([, ok]) => ok).length;
const requiredTotal = requiredChecks.length;
const requiredPercent = (requiredPassed / requiredTotal) * 100;

const informationalPassed = informationalChecks.filter(([, ok]) => ok).length;
const informationalTotal = informationalChecks.length;
const informationalPercent = (informationalPassed / informationalTotal) * 100;

for (const [name, ok] of requiredChecks) {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} - ${name}\n`);
}

for (const [name, ok] of informationalChecks) {
  process.stdout.write(`${ok ? 'INFO' : 'MISS'} - ${name}\n`);
}

process.stdout.write(`Documentation coverage (required): ${requiredPercent.toFixed(2)}% (${requiredPassed}/${requiredTotal})\n`);
process.stdout.write(`Documentation coverage (informational): ${informationalPercent.toFixed(2)}% (${informationalPassed}/${informationalTotal})\n`);

if (requiredPercent < 98) {
  process.stderr.write('Documentation coverage below required 98% threshold\n');
  process.exit(1);
}
