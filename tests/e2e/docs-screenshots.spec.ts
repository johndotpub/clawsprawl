import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const screenshotDir = path.join(process.cwd(), 'docs', 'screenshots');
const privateUnlockToken = process.env.CLAWSPRAWL_PRIVATE_TOKEN ?? 'docs-private-token';

test.skip(!process.env.DOCS_SCREENSHOTS, 'Run only when DOCS_SCREENSHOTS=1 is set.');

/**
 * Disable CSS animations/transitions so screenshots are deterministic.
 * Also hides blinking cursors and disables smooth-scroll.
 */
async function stabilize(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({
    content:
      '*{animation:none!important;transition:none!important;caret-color:transparent!important;} html{scroll-behavior:auto!important;}',
  });
}

/**
 * Wait for the live gateway dashboard to fully hydrate with real data.
 *
 * Waits for:
 *   1. Connection state element to show "connected"
 *   2. At least one agent row to render (proves data arrived)
 *   3. Hero status text to show "online" (proves full render pass)
 *   4. A brief settle delay for any trailing renders
 *
 * Falls back gracefully if the gateway is unreachable — screenshots
 * will capture whatever state the dashboard is in after timeout.
 */
async function waitForLiveData(page: Page): Promise<boolean> {
  try {
    await expect(page.locator('#gateway-connection-state')).toContainText('connected', { timeout: 20_000 });
    // Wait for at least one agent row to render (proves data arrived from gateway)
    await expect(page.locator('#gateway-agent-list li').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#hero-status-text')).toContainText('online', { timeout: 5_000 });
    // Brief settle for any trailing panel renders triggered by SSE events
    await page.waitForTimeout(1_500);
    return true;
  } catch {
    console.warn('[docs-screenshots] Live gateway data did not fully load — capturing current state.');
    return false;
  }
}

/** Unlock private dashboard view in token mode and wait for private panels. */
async function unlockPrivateView(page: Page): Promise<void> {
  const tokenInput = page.locator('#private-view-token');
  const unlockButton = page.locator('#private-view-form button[type="submit"]');
  await expect(tokenInput).toBeVisible({ timeout: 10_000 });
  await tokenInput.fill(privateUnlockToken);

  await unlockButton.click();
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('#private-view-lock')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#gateway-event-list')).toBeVisible({ timeout: 15_000 });
  await waitForLiveData(page);
}

test('capture documentation screenshots (desktop + mobile)', async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(screenshotDir, { recursive: true });

  // --- Desktop (1600×1200) ---
  const desktop = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto('/');
  await waitForLiveData(desktopPage);
  await stabilize(desktopPage);

  // Public locked state
  await desktopPage.screenshot({
    path: path.join(screenshotDir, 'main-overview-desktop-public-locked.png'),
    fullPage: true,
  });

  // Private unlocked state
  await unlockPrivateView(desktopPage);
  await stabilize(desktopPage);
  await desktopPage.screenshot({
    path: path.join(screenshotDir, 'main-overview-desktop-private-unlocked.png'),
    fullPage: true,
  });

  await desktop.close();

  // --- Mobile (390×844, iPhone 14-ish) ---
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto('/');
  await waitForLiveData(mobilePage);
  await stabilize(mobilePage);

  // Public locked state
  await mobilePage.screenshot({
    path: path.join(screenshotDir, 'main-overview-mobile-public-locked.png'),
    fullPage: true,
  });

  // Private unlocked state
  await unlockPrivateView(mobilePage);
  await stabilize(mobilePage);
  await mobilePage.screenshot({
    path: path.join(screenshotDir, 'main-overview-mobile-private-unlocked.png'),
    fullPage: true,
  });

  await mobile.close();
});
