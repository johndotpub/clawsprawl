import { expect, test } from '@playwright/test';

test('renders server-default theme and lets user switch with persistence', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-cs-theme', 'sprawl');

  const inlineStyle = page.locator('style#cs-theme-vars');
  const styleContent = await inlineStyle.evaluate((el) => el.textContent || '');
  expect(styleContent).toContain('--color-terminal-green: #00ff41;');

  const select = page.locator('#cs-theme-select');
  await select.selectOption('cyberpunk');

  await expect(html).toHaveAttribute('data-cs-theme', 'cyberpunk');
  const cyberpunkContent = await inlineStyle.evaluate((el) => el.textContent || '');
  expect(cyberpunkContent).toContain('--color-terminal-green: #ff2bd6;');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0d0220');

  await page.reload();
  await expect(html).toHaveAttribute('data-cs-theme', 'cyberpunk');
  const reloadedContent = await inlineStyle.evaluate((el) => el.textContent || '');
  expect(reloadedContent).toContain('--color-terminal-green: #ff2bd6;');
});

test('falls back to sprawl for unknown stored theme', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('clawsprawl:theme', 'nope');
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-cs-theme', 'sprawl');
});

const THEME_IDS = ['sprawl', 'cyberpunk', 'midnight', 'ember', 'mono', 'slate'] as const;

for (const themeId of THEME_IDS) {
  test(`applies ${themeId} theme via the switcher`, async ({ page }) => {
    await page.goto('/');
    await page.locator('#cs-theme-select').selectOption(themeId);
    await expect(page.locator('html')).toHaveAttribute('data-cs-theme', themeId);
  });
}