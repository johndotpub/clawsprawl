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

  // "connected" only proves the browser reached the SSR server. The SSR
  // server's own gateway snapshot can still be empty on first paint, which
  // produced a zero-agent screenshot on 2026-10-27. Wait for the hero agent
  // counter to reach a real positive number before capturing.
  await expect
    .poll(
      async () => Number((await page.locator('#hero-agent-count').textContent())?.trim()),
      { timeout: 45_000, message: 'waiting for gateway agent data to populate' },
    )
    .toBeGreaterThan(0);

  await page.waitForTimeout(1_500);
}

/**
 * Assert the page rendered in the mode this pass intends to capture.
 *
 * The capture script runs once per mode, but a reused dev server keeps the mode
 * it booted with. Without this guard both passes photograph the same server and
 * the "public locked" image silently ships private data. Failing loudly is the
 * only safe behaviour here.
 */
async function expectMode(page: Page, expected: 'public' | 'insecure'): Promise<void> {
  const privateVisible = await page
    .locator('text=/private view unlocked/i')
    .count();
  const publicVisible = await page.locator('text=/public panels visible/i').count();

  if (expected === 'public') {
    if (privateVisible > 0) {
      throw new Error(
        'Refusing to capture a public-locked screenshot: the server is in insecure mode ' +
          '(page reports "private view unlocked"). Check that CLAWSPRAWL_MODE=public is ' +
          'reachable and that no server was reused from another mode.',
      );
    }
    expect(publicVisible, 'public pass must report "public panels visible"').toBeGreaterThan(0);
  } else {
    if (publicVisible > 0) {
      throw new Error(
        'Refusing to capture a private-unlocked screenshot: the server is in public mode ' +
          '(page reports "public panels visible").',
      );
    }
    expect(privateVisible, 'insecure pass must report "private view unlocked"').toBeGreaterThan(0);
  }
}

test('capture public-locked screenshots (desktop + mobile)', async ({ browser }) => {
  test.skip(mode !== 'public', 'Public-locked screenshots only captured in public mode.');
  test.setTimeout(120_000);
  await mkdir(screenshotDir, { recursive: true });

  const desktop = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto('/');
  await waitForLiveData(desktopPage);
  await expectMode(desktopPage, 'public');
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
  await expectMode(mobilePage, 'public');
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
  await expectMode(desktopPage, 'insecure');
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
  await expectMode(mobilePage, 'insecure');
  await stabilize(mobilePage);
  await mobilePage.screenshot({
    path: path.join(screenshotDir, 'main-overview-mobile-private-unlocked.png'),
    fullPage: true,
  });
  await mobile.close();
});