import { expect, test } from '@playwright/test';

test('homepage renders Hero and live operations dashboard', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Live Operations Dashboard' })).toBeVisible();
  await expect(page.getByText('Retry Connection')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Private Operations View' })).toBeVisible();
  await expect(page.getByText('Private View Disabled')).toBeVisible();
  // Hero live targets exist
  await expect(page.locator('#hero-agent-count')).toBeVisible();
  await expect(page.locator('#hero-status-dot')).toBeVisible();
  await expect(page.locator('#hero-status-text')).toBeVisible();
});

test('public dashboard panels render while private panels stay locked by default', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#gateway-agent-list')).toBeVisible();
  await expect(page.locator('#gateway-cron-list')).toBeVisible();
  await expect(page.locator('#gateway-provider-list')).toBeVisible();
  await expect(page.locator('#gateway-model-list')).toBeVisible();
  await expect(page.locator('#gateway-health-list')).toBeVisible();
  await expect(page.locator('#gateway-status-list')).toBeVisible();
  await expect(page.locator('#gateway-usage-cost-list')).toBeVisible();
  await expect(page.locator('#gateway-tool-catalog-list')).toBeVisible();
  await expect(page.locator('#gateway-skills-list')).toBeVisible();
  await expect(page.locator('#gateway-channels-status-list')).toBeVisible();
  await expect(page.locator('#gateway-cron-scheduler-list')).toBeVisible();
  await expect(page.locator('#gateway-memory-status-list')).toBeVisible();

  await expect(page.locator('#gateway-event-list')).toHaveCount(0);
  await expect(page.locator('#gateway-session-list')).toHaveCount(0);
  await expect(page.locator('#gateway-presence-list')).toHaveCount(0);
  await expect(page.locator('#gateway-config-list')).toHaveCount(0);
  await expect(page.locator('#gateway-permission-activity-list')).toHaveCount(0);
  await expect(page.locator('#gateway-tool-execution-list')).toHaveCount(0);
  await expect(page.locator('#gateway-file-tracking-list')).toHaveCount(0);
  await expect(page.locator('#gateway-session-detail-list')).toHaveCount(0);
});

test('private preview explains what stays locked before auth', async ({ page }) => {
  await page.goto('/');

  await page.locator('#private-preview summary').click();

  await expect(page.getByText('Preview private cards')).toBeVisible();
  await expect(page.getByText('contains client identity')).toBeVisible();
  await expect(page.getByText('contains tool activity')).toBeVisible();
  await expect(page.getByText('Contains detailed realtime operator activity.')).toBeVisible();
  await expect(page.locator('#gateway-stale-badge')).toBeVisible();
});

test('mobile layout does not introduce horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  await page.goto('/');

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  await expect(hasOverflow).toBe(false);
  await context.close();
});
