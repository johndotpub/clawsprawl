/**
 * E2E tests against a live OpenClaw gateway.
 *
 * These tests are gated behind the `E2E_LIVE_GATEWAY=1` environment variable
 * and require a running gateway at `http://127.0.0.1:18789` plus the Astro
 * dev server. They exercise the full stack: browser → Astro SSR → gateway.
 *
 * Run:
 *   E2E_LIVE_GATEWAY=1 npx playwright test tests/e2e/live-gateway.spec.ts
 */

import { expect, test } from '@playwright/test';

const LIVE = process.env.E2E_LIVE_GATEWAY === '1';

test.describe('live gateway integration', () => {
  test.skip(!LIVE, 'Skipped — set E2E_LIVE_GATEWAY=1 to enable live gateway E2E tests');

  test('GET /api/public/dashboard.json returns valid public snapshot with live data', async ({ request }) => {
    const response = await request.get('/api/public/dashboard.json');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.connectionState).toBe('connected');
    expect(Array.isArray(data.agents)).toBe(true);
    expect(Array.isArray(data.sessions)).toBe(true);
    expect(Array.isArray(data.models)).toBe(true);
    expect(data.status).toBeTruthy();
    expect(data.health).toBeTruthy();
    expect(data.sessions).toEqual([]);
    expect(data.presence).toEqual([]);
    expect(data.configData).toBeNull();
  });

  test('GET /api/private/health.json requires private auth by default', async ({ request }) => {
    const response = await request.get('/api/private/health.json');
    expect(response.status()).toBe(401);

    const data = await response.json();
    expect(data.error).toBe('private-auth-required');
  });

  test('legacy mixed routes return 410', async ({ request }) => {
    const [dashboard, events, health] = await Promise.all([
      request.get('/api/dashboard.json'),
      request.get('/api/events'),
      request.get('/api/health.json'),
    ]);

    expect(dashboard.status()).toBe(410);
    expect(events.status()).toBe(410);
    expect(health.status()).toBe(410);
  });

  test('SSE /api/public/events connects and receives ping within 30s', async ({ page }) => {
    const pingReceived = await page.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 30_000);
        const es = new EventSource('/api/public/events');
        es.addEventListener('ping', () => {
          clearTimeout(timeout);
          es.close();
          resolve(true);
        });
        es.onerror = () => {
          clearTimeout(timeout);
          es.close();
          resolve(false);
        };
      });
    });

    expect(pingReceived).toBe(true);
  });

  test('homepage renders public dashboard by default with locked private preview', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#gateway-connection-state')).toContainText('connected', { timeout: 15_000 });

    await expect(page.locator('#gateway-agent-list')).not.toContainText('Loading');
    await expect(page.locator('#gateway-agent-list li').first()).toBeVisible({ timeout: 5_000 });

    const publicPanelIds = [
      'gateway-agent-list', 'gateway-cron-list', 'gateway-provider-list',
      'gateway-model-list', 'gateway-health-list', 'gateway-status-list',
      'gateway-usage-cost-list', 'gateway-tool-catalog-list', 'gateway-skills-list',
      'gateway-channels-status-list', 'gateway-cron-scheduler-list', 'gateway-memory-status-list',
    ];

    for (const id of publicPanelIds) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }

    await expect(page.locator('#gateway-event-list')).toHaveCount(0);
    await expect(page.locator('#gateway-session-list')).toHaveCount(0);
    await expect(page.locator('#gateway-presence-list')).toHaveCount(0);
    await expect(page.locator('#private-preview')).toBeVisible();

    await expect(page.locator('#hero-status-text')).toContainText('online');
  });

  test('dashboard shows real model providers from live gateway', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#gateway-connection-state')).toContainText('connected', { timeout: 15_000 });

    // Provider list should have at least one row (not empty state)
    const providerHtml = await page.locator('#gateway-provider-list').innerHTML();
    expect(providerHtml).not.toContain('No model provider data loaded.');
    expect(providerHtml).toContain('healthy');
  });

  test('retry button triggers dashboard re-fetch', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#gateway-connection-state')).toContainText('connected', { timeout: 15_000 });

    // Click retry button
    await page.click('#gateway-retry');

    // Dashboard should still show connected after re-bootstrap
    await expect(page.locator('#gateway-connection-state')).toContainText('connected', { timeout: 10_000 });
  });
});
