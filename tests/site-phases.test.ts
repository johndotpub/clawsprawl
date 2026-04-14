import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), 'utf8');
}

describe('architecture and release-governance hardening checks', () => {
  it('keeps Astro SSR output mode with Node adapter', async () => {
    const config = await read('astro.config.mjs');
    expect(config).toContain("output: 'server'");
    expect(config).toContain('@astrojs/node');
  });

  it('keeps terminal theme tokens in global styles', async () => {
    const css = await read('src/styles/global.css');
    expect(css).toContain('--color-terminal-bg: #0a0a0a;');
    expect(css).toContain('--color-terminal-green: #00ff41;');
    expect(css).toContain('color-scheme: dark;');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('enforces dark mode metadata in base layout', async () => {
    const baseLayout = await read('src/layouts/Base.astro');
    expect(baseLayout).toContain('<meta name="color-scheme" content="dark" />');
  });

  it('renders live-data-driven index with Hero and GatewayBootstrap only', async () => {
    const index = await read('src/pages/index.astro');
    expect(index).toContain("import Hero from '../components/landing/Hero.astro';");
    expect(index).toContain('<Hero');
    expect(index).toContain("import GatewayBootstrap from '../components/dashboard/GatewayBootstrap.astro';");
    expect(index).toContain('<GatewayBootstrap');
    // Static data components removed — all operational data is live
    expect(index).not.toContain('AgentFamily');
    expect(index).not.toContain('Capabilities');
    expect(index).not.toContain('Infrastructure');
    expect(index).not.toContain('LiveDashboardPreview');
    expect(index).not.toContain('expectedProviders');
  });

  it('keeps profiles as branding-only (no static operational data)', async () => {
    const sprawlLab = await read('src/config/profiles/sprawl-lab.ts');
    expect(sprawlLab).toContain("id: 'sprawl-lab'");
    expect(sprawlLab).toContain("heroTitle: 'Sprawl Lab'");
    // No static agents, capabilities, providers, or jobs
    expect(sprawlLab).not.toContain('agents:');
    expect(sprawlLab).not.toContain('capabilities:');
    expect(sprawlLab).not.toContain('providers:');
    expect(sprawlLab).not.toContain('jobs:');
  });

  it('wires phase 3 gateway bootstrap section into index (no expectedProviders)', async () => {
    const index = await read('src/pages/index.astro');
    expect(index).toContain("import GatewayBootstrap from '../components/dashboard/GatewayBootstrap.astro';");
    expect(index).toContain('<GatewayBootstrap');
    expect(index).not.toContain('expectedProviders');
  });

  it('keeps gateway client modules present for server-side use', async () => {
    const client = await read('src/lib/gateway/client.ts');
    const protocol = await read('src/lib/gateway/protocol.ts');
    const types = await read('src/lib/gateway/types.ts');

    expect(client).toContain('export class GatewayClient');
    expect(protocol).toContain('export function buildRequest');
    expect(protocol).toContain('export const CLIENT_VERSION');
    expect(types).toContain("export type ConnectionState =");
    expect(types).toContain("'handshaking'");
  });

  it('includes phase 4 live operations panel containers', async () => {
    const gatewayPanel = await read('src/components/dashboard/GatewayBootstrap.astro');
    const panelConfig = await read('src/lib/dashboard/panel-config.ts');
    expect(gatewayPanel).toContain('Live Operations Dashboard');
    expect(gatewayPanel).toMatch(/id=["']gateway-agent-list["']/);
    expect(gatewayPanel).toMatch(/id=["']gateway-event-list["']/);
    expect(gatewayPanel).toMatch(/id=["']gateway-event-filters["']/);
    expect(gatewayPanel).toMatch(/id=["']gateway-stale-badge["']/);
    expect(gatewayPanel).toMatch(/id=["']private-view-form["']/);
    expect(gatewayPanel).toMatch(/id=["']private-preview["']/);
    expect(gatewayPanel).toContain('Event Filter');
    expect(gatewayPanel).not.toContain('gateway-incidents-only');
    expect(panelConfig).toContain('gateway-cron-list');
    expect(panelConfig).toContain('gateway-provider-list');
    expect(panelConfig).toContain('gateway-usage-cost-list');
    expect(panelConfig).toContain('gateway-tool-catalog-list');
    expect(panelConfig).toContain('gateway-skills-list');
    expect(panelConfig).toContain('gateway-channels-status-list');
    expect(panelConfig).toContain('gateway-cron-scheduler-list');
    expect(panelConfig).toContain('gateway-memory-status-list');
  });

  it('wires Hero to live gateway state with DOM targets', async () => {
    const hero = await read('src/components/landing/Hero.astro');
    const bootstrap = await read('src/lib/dashboard/bootstrap.ts');

    expect(hero).toMatch(/id=["']hero-agent-count["']/);
    expect(hero).toMatch(/id=["']hero-status-dot["']/);
    expect(hero).toMatch(/id=["']hero-status-text["']/);
    expect(hero).not.toContain('agentCount');
    expect(hero).not.toContain('statusLine');
    expect(bootstrap).toContain('heroAgentCountEl');
    expect(bootstrap).toContain('heroStatusDotEl');
    expect(bootstrap).toContain('heroStatusTextEl');
  });

  it('includes phase 5 reconnect and loading hardening controls', async () => {
    const gatewayPanel = await read('src/components/dashboard/GatewayBootstrap.astro');
    const styles = await read('src/styles/global.css');
    const bootstrap = await read('src/lib/dashboard/bootstrap.ts');

    expect(gatewayPanel).toMatch(/id=["']gateway-retry["']/);
    expect(bootstrap).toContain('renderSkeletons');
    expect(bootstrap).toContain('scheduleRefresh');
    expect(styles).toContain('.terminal-button');
    expect(styles).toContain('.skeleton-row');
  });

  it('uses SSR architecture with server-side gateway and API routes', async () => {
    const bootstrap = await read('src/lib/dashboard/bootstrap.ts');
    const serverService = await read('src/lib/gateway/server-service.ts');
    const publicDashboardApi = await read('src/pages/api/public/dashboard.json.ts');
    const publicEventsApi = await read('src/pages/api/public/events.ts');
    const privateDashboardApi = await read('src/pages/api/private/dashboard.json.ts');
    const privateEventsApi = await read('src/pages/api/private/events.ts');
    const privateHealthApi = await read('src/pages/api/private/health.json.ts');
    const deprecatedDashboardApi = await read('src/pages/api/dashboard.json.ts');
    const deprecatedEventsApi = await read('src/pages/api/events.ts');
    const deprecatedHealthApi = await read('src/pages/api/health.json.ts');
    const envExample = await read('.env.example');

    // Bootstrap uses fetch + EventSource, not direct WS
    expect(bootstrap).toContain('fetchDashboard');
    expect(bootstrap).toContain('EventSource');
    expect(bootstrap).toContain('PUBLIC_DASHBOARD_API_URL');
    expect(bootstrap).toContain('PRIVATE_DASHBOARD_API_URL');
    expect(bootstrap).toContain('PUBLIC_EVENTS_API_URL');
    expect(bootstrap).toContain('PRIVATE_EVENTS_API_URL');
    expect(bootstrap).not.toContain('GatewayClient');
    expect(bootstrap).not.toContain('PUBLIC_GATEWAY_WS_URL');
    expect(bootstrap).not.toContain('PUBLIC_GATEWAY_TOKEN');

    // Server service holds gateway connection
    expect(serverService).toContain('GatewayServerService');
    expect(serverService).toContain('OPENCLAW_GATEWAY_TOKEN');
    expect(serverService).toContain('CLIENT_VERSION');

    // Public/private API routes exist and old mixed routes are deprecated.
    expect(publicDashboardApi).toContain('getServerService');
    expect(publicEventsApi).toContain('text/event-stream');
    expect(privateDashboardApi).toContain('isPrivateRouteAllowed');
    expect(privateEventsApi).toContain('text/event-stream');
    expect(privateHealthApi).toContain('isPrivateRouteAllowed');
    expect(deprecatedDashboardApi).toContain('deprecated-route');
    expect(deprecatedEventsApi).toContain('deprecated-route');
    expect(deprecatedHealthApi).toContain('deprecated-route');

    // Env example is server-only (no PUBLIC_GATEWAY_* vars)
    expect(envExample).toContain('OPENCLAW_GATEWAY_TOKEN=');
    expect(envExample).toContain('PUBLIC_MAINFRAME_PROFILE=');
    expect(envExample).not.toContain('PUBLIC_GATEWAY_WS_URL');
    expect(envExample).not.toContain('PUBLIC_GATEWAY_TOKEN');
    expect(envExample).not.toContain('OTEL_ENABLED');
    expect(envExample).not.toContain('ALERT_WEBHOOK_URL');
  });

  it('removes proxy infrastructure', async () => {
    const pkg = await read('package.json');
    const csOps = await read('scripts/cs-ops.sh');

    // No proxy script in package.json
    expect(pkg).not.toContain('proxy:gateway');
    expect(pkg).not.toContain('"ws"');

    // cs-ops.sh has no proxy command
    expect(csOps).not.toContain('proxy:gateway');
    expect(csOps).not.toContain('WITH_PROXY');

    // Has new start command
    expect(pkg).toContain('"start"');
    expect(csOps).toContain('start)');
  });

  it('includes phase 6 ci and e2e quality pipeline assets', async () => {
    const pkg = await read('package.json');
    const workflow = await read('.github/workflows/ci.yml');
    const playwright = await read('playwright.config.ts');

    expect(pkg).toContain('"test:e2e"');
    expect(workflow).toContain('Run e2e smoke tests');
    expect(playwright).toContain("testDir: './tests/e2e'");
  });

  it('includes phase 7 heredoc api docs and extension guide', async () => {
    const readme = await read('README.md');
    const docsIndex = await read('docs/README.md');
    const heredocDoc = await read('docs/heredoc-api-sourcecode.md');
    const extensionDoc = await read('docs/extensions.md');
    const design = await read('docs/technical-design-plan.md');

    expect(readme).toContain('heredoc-api-sourcecode');
    expect(readme).toContain('extensions.md');
    expect(readme).toContain('docs/README.md');
    expect(docsIndex).toMatch(/Documentation\s+Index/i);
    expect(docsIndex).toContain('technical-design-plan.md');
    expect(heredocDoc).toMatch(/cat\s+<<\s*'?EOF'?/);
    expect(heredocDoc).toContain('client.ts');
    expect(extensionDoc).toMatch(/Extension\s+Checklist/i);
    expect(design).toContain('## Testing and Quality Gates');
  });

  it('includes phase 11 open-source and semver baseline files', async () => {
    const readme = await read('README.md');
    const pkg = await read('package.json');
    const changelog = await read('CHANGELOG.md');
    const versioning = await read('VERSIONING.md');
    const license = await read('LICENSE');
    const contributing = await read('CONTRIBUTING.md');
    const conduct = await read('CODE_OF_CONDUCT.md');
    const security = await read('SECURITY.md');
    const support = await read('SUPPORT.md');
    const agents = await read('AGENTS.md');

    expect(readme).toMatch(/Release.*Versioning/i);
    expect(pkg).toMatch(/"version":\s*"\d+\.\d+\.\d+"/);
    expect(pkg).toContain('"qa"');
    expect(changelog).toMatch(/## \[\d+\.\d+\.\d+\]/);
    expect(versioning).toMatch(/Semantic\s+Versioning/i);
    expect(license).toContain('public domain');
    expect(contributing).toMatch(/Contributing\s+Guide/i);
    expect(conduct).toMatch(/Code\s+of\s+Conduct/i);
    expect(security).toMatch(/Security\s+Policy/i);
    expect(support).toMatch(/Getting\s+Help/i);
    expect(agents).toMatch(/Agentic\s+Conventions/i);
  });

  it('adds phase 12 profile modularization for open-source configurability', async () => {
    const envExample = await read('.env.example');
    const profiles = await read('src/config/profiles/index.ts');
    const publicProfile = await read('src/config/profiles/public-demo.ts');
    const sprawlLab = await read('src/config/profiles/sprawl-lab.ts');
    const setupLocal = await read('scripts/setup-local-profile.mjs');
    const readme = await read('README.md');

    expect(envExample).toContain('PUBLIC_MAINFRAME_PROFILE=sprawl-lab');
    expect(profiles).toContain('resolveMainframeProfile');
    expect(profiles).toMatch(/import\.meta\.glob\(['"]\.\/\*\.local\.ts['"]/);
    expect(publicProfile).toContain("id: 'public-demo'");
    expect(sprawlLab).toContain("id: 'sprawl-lab'");
    expect(setupLocal).toContain("id: 'private-local'");
    expect(setupLocal).toMatch(/created.*local.*from template/i);
    expect(readme).toContain('profile:local:init');
  });

  it('adds phase 13 strict QA coverage gates and scripts', async () => {
    const pkg = await read('package.json');
    const design = await read('docs/technical-design-plan.md');
    const readme = await read('README.md');
    const docsCoverage = await read('scripts/qa/docs-coverage.mjs');
    const e2eCoverage = await read('tests/e2e/code-coverage.spec.ts');

    expect(pkg).toContain('"test:unit:coverage"');
    expect(pkg).toContain('"test:e2e:coverage"');
    expect(pkg).toContain('"test:docs:coverage"');
    expect(pkg).toContain('"qa:strict"');
    expect(design).toContain('npm run qa:strict');
    expect(design).toContain('## v0.42.0 Active Roadmap');
    expect(readme).toMatch(/[Cc]overage\s+targets/);
    expect(readme).toContain('CodeQL');
    expect(readme).toContain('gitleaks');
    expect(docsCoverage).toMatch(/[Dd]ocumentation\s+coverage/i);
    expect(e2eCoverage).toMatch(/>=\s*80%/);
  });
});
