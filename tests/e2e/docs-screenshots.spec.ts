import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const screenshotDir = path.join(process.cwd(), 'docs', 'screenshots');
const mode = process.env.CLAWSPRAWL_MODE ?? 'public';

test.skip(!process.env.DOCS_SCREENSHOTS, 'Run only when DOCS_SCREENSHOTS=1 is set.');

async function stabilize(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({
    content:
      '*{animation:none!important;transition:none!important;caret-color:transparent!important;} html{scroll-behavior:auto!important;}',
  });
}

async function waitForLiveData(page: Page): Promise<void> {
  await expect(page.locator('#gateway-connection-state')).toContainText('connected', { timeout: 20_000 });
  await expect(page.locator('#gateway-agent-list li').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#hero-status-text')).toContainText('online', { timeout: 5_000 });
  await page.waitForTimeout(1_500);
}

test('capture public-locked screenshots (desktop + mobile)', async ({ browser }) => {
  test.skip(mode !== 'public', 'Public-locked screenshots only captured in public mode.');
  test.setTimeout(120_000);
  await mkdir(screenshotDir, { recursive: true });

  const desktop = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto('/');
  await waitForLiveData(desktopPage);
  await stabilize(desktopPage);
  await desktopPage.screenshot({
    path: path.join(screenshotDir, 'main-overview-desktop-public-locked.png'),
    fullPage: true,
  });
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto('/');
  await waitForLiveData(mobilePage);
  await stabilize(mobilePage);
  await mobilePage.screenshot({
    path: path.join(screenshotDir, 'main-overview-mobile-public-locked.png'),
    fullPage: true,
  });
  await mobile.close();
});

test('capture private-unlocked screenshots (desktop + mobile)', async ({ browser }) => {
  test.skip(mode !== 'insecure', 'Private-unlocked screenshots only captured in insecure mode.');
  test.setTimeout(120_000);
  await mkdir(screenshotDir, { recursive: true });

  const desktop = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto('/');
  await waitForLiveData(desktopPage);
  await stabilize(desktopPage);
  await desktopPage.screenshot({
    path: path.join(screenshotDir, 'main-overview-desktop-private-unlocked.png'),
    fullPage: true,
  });
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto('/');
  await waitForLiveData(mobilePage);
  await stabilize(mobilePage);
  await mobilePage.screenshot({
    path: path.join(screenshotDir, 'main-overview-mobile-private-unlocked.png'),
    fullPage: true,
  });
  await mobile.close();
});