import { expect, test } from '@playwright/test';

test.skip(!process.env.E2E_COVERAGE, 'Run only in e2e coverage mode.');

function isAppEntry(entry: any): boolean {
  const url = String(entry?.url ?? '');
  if (!url) return true;
  if (url.includes('/src/')) return true;
  if (url.includes('/_astro/')) return true;
  if (url.includes('/@fs/') && url.includes('/src/')) return true;
  return false;
}

function usedBytes(entry: any): number {
  const mergeRanges = (ranges: Array<{ start: number; end: number }>): number => {
    if (ranges.length === 0) {
      return 0;
    }

    const sorted = [...ranges].sort((left, right) => left.start - right.start);
    const merged: Array<{ start: number; end: number }> = [];

    for (const range of sorted) {
      const last = merged[merged.length - 1];
      if (!last || range.start > last.end) {
        merged.push({ ...range });
      } else if (range.end > last.end) {
        last.end = range.end;
      }
    }

    return merged.reduce((sum, range) => sum + (range.end - range.start), 0);
  };

  if (Array.isArray(entry?.ranges)) {
    return mergeRanges(entry.ranges.map((range: { start: number; end: number }) => ({ start: range.start, end: range.end })));
  }
  if (Array.isArray(entry?.functions)) {
    const ranges = entry.functions.flatMap((fn: any) => {
      if (!Array.isArray(fn?.ranges)) {
        return [];
      }
      return fn.ranges
        .filter((range: { count: number }) => range.count > 0)
        .map((range: { startOffset: number; endOffset: number }) => ({ start: range.startOffset, end: range.endOffset }));
    });
    return mergeRanges(ranges);
  }
  return 0;
}

test('e2e code coverage for dashboard runtime is >= 80%', async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });

  await page.goto('/');
  await page.locator('#private-preview summary').click();
  await page.getByText('Preview private cards').click();
  await page.getByText('Retry Connection').click();

  const entries = await page.coverage.stopJSCoverage();

  const appEntries = entries.filter(isAppEntry);

  const total = appEntries.reduce((sum, entry) => {
    const source = String((entry as { source?: string; text?: string }).source ?? (entry as { text?: string }).text ?? '');
    return sum + source.length;
  }, 0);
  const used = appEntries.reduce((sum, entry) => sum + usedBytes(entry), 0);
  const percent = total > 0 ? (used / total) * 100 : 0;

  console.log(`E2E runtime code coverage: ${percent.toFixed(2)}%`);

  expect(appEntries.length).toBeGreaterThan(0);
  expect(percent).toBeGreaterThanOrEqual(80);
});
