import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES, sprawlTheme } from './presets';
import { isKnownTheme, listThemeIds, listThemes, resolveTheme } from './index';
import { DEFAULT_THEME_ID } from './types';

const TOKEN_KEYS = [
  '--color-terminal-bg', '--color-terminal-surface', '--color-terminal-surface-2',
  '--color-terminal-border', '--color-terminal-text', '--color-terminal-muted',
  '--color-terminal-green', '--color-terminal-amber', '--color-terminal-cyan',
  '--color-terminal-error',
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('theme presets', () => {
  it('ships at least 6 built-in themes', () => {
    expect(BUILTIN_THEMES.length).toBeGreaterThanOrEqual(6);
  });

  it('uses unique ids', () => {
    const ids = BUILTIN_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const theme of BUILTIN_THEMES) {
    describe(`theme: ${theme.id}`, () => {
      it('declares every required token as #rrggbb', () => {
        for (const key of TOKEN_KEYS) {
          expect(theme.tokens).toHaveProperty(key);
          expect(theme.tokens[key as keyof typeof theme.tokens]).toMatch(HEX);
        }
      });

      it('is dark-mode (bg luminance < 0.18)', () => {
        expect(relativeLuminance(theme.tokens['--color-terminal-bg'])).toBeLessThan(0.18);
      });

      it('exposes a dark themeColor meta', () => {
        expect(theme.themeColor).toMatch(HEX);
        expect(relativeLuminance(theme.themeColor)).toBeLessThan(0.18);
      });

      it('keeps text/bg contrast >= 4.5:1 (WCAG AA)', () => {
        const ratio = contrastRatio(
          theme.tokens['--color-terminal-text'],
          theme.tokens['--color-terminal-bg'],
        );
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    });
  }

  it('sprawl preset matches the current global.css defaults byte-for-byte', () => {
    expect(sprawlTheme.tokens).toEqual({
      '--color-terminal-bg': '#0a0a0a',
      '--color-terminal-surface': '#111111',
      '--color-terminal-surface-2': '#151515',
      '--color-terminal-border': '#2a2a2a',
      '--color-terminal-text': '#e6e6e6',
      '--color-terminal-muted': '#9a9a9a',
      '--color-terminal-green': '#00ff41',
      '--color-terminal-amber': '#ffb000',
      '--color-terminal-cyan': '#00d4ff',
      '--color-terminal-error': '#ff4d4f',
    });
  });
});

describe('theme resolver', () => {
  it('lists all preset ids', () => {
    expect(listThemeIds()).toContain('sprawl');
    expect(listThemeIds()).toContain('slate');
    expect(listThemeIds()).toContain('cyberpunk');
  });

  it('listThemes returns all themes in order', () => {
    expect(listThemes()).toHaveLength(BUILTIN_THEMES.length);
    expect(listThemes()[0]?.id).toBe('sprawl');
  });

  it('defaults to sprawl for unknown ids', () => {
    expect(resolveTheme('nope').id).toBe(DEFAULT_THEME_ID);
  });

  it('defaults to sprawl for null/undefined', () => {
    expect(resolveTheme(null).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme(undefined).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme().id).toBe(DEFAULT_THEME_ID);
  });

  it('resolves known themes correctly', () => {
    expect(resolveTheme('cyberpunk').id).toBe('cyberpunk');
    expect(resolveTheme('midnight').id).toBe('midnight');
  });

  it('narrows id type via isKnownTheme', () => {
    expect(isKnownTheme('sprawl')).toBe(true);
    expect(isKnownTheme('nope')).toBe(false);
    expect(isKnownTheme(undefined)).toBe(false);
    expect(isKnownTheme(null)).toBe(false);
  });
});