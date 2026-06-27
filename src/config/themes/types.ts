/**
 * ClawSprawl theme — a set of overrides for the `--color-terminal-*`
 * custom properties declared in `src/styles/global.css` `@theme` block.
 *
 * Every theme MUST be a dark theme (project policy). Themes map 1:1 to the
 * existing token names — they must NOT introduce new variable names.
 */

/** Token overrides — every `--color-terminal-*` key is required. */
export interface ThemeTokens {
  '--color-terminal-bg': string;
  '--color-terminal-surface': string;
  '--color-terminal-surface-2': string;
  '--color-terminal-border': string;
  '--color-terminal-text': string;
  '--color-terminal-muted': string;
  '--color-terminal-green': string;
  '--color-terminal-amber': string;
  '--color-terminal-cyan': string;
  '--color-terminal-error': string;
  [key: string]: string;
}

/** A complete theme definition. */
export interface ClawSprawlTheme {
  /** Unique slug (e.g. `"sprawl"`). Lowercase, kebab-case. */
  id: string;
  /** Human-readable label rendered in the switcher (e.g. `"Sprawl"`). */
  label: string;
  /** One-line description shown in CLI `list` output. */
  description: string;
  /** Hex string used for `<meta name="theme-color">` (must be dark). */
  themeColor: string;
  /** Token overrides — every `--color-terminal-*` key is required. */
  tokens: ThemeTokens;
}

/** localStorage key for browser-side theme persistence. */
export const THEME_STORAGE_KEY = 'clawsprawl:theme';

/** Default theme id (byte-identical to the original global.css values). */
export const DEFAULT_THEME_ID = 'sprawl';