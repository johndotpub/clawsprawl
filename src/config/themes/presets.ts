import type { ClawSprawlTheme } from './types';

/**
 * Default theme — byte-identical to the original `global.css` `@theme` block.
 * Neon green on black: the classic ClawSprawl terminal aesthetic.
 */
export const sprawlTheme: ClawSprawlTheme = {
  id: 'sprawl',
  label: 'Sprawl',
  description: 'Neon green on black — classic ClawSprawl terminal.',
  themeColor: '#0a0a0a',
  tokens: {
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
  },
};

/** Magenta/cyan neon on near-black — high-saturation cyberpunk vibe. */
export const cyberpunkTheme: ClawSprawlTheme = {
  id: 'cyberpunk',
  label: 'Cyberpunk',
  description: 'Magenta/cyan neon on near-black — high saturation.',
  themeColor: '#0d0220',
  tokens: {
    '--color-terminal-bg': '#0d0220',
    '--color-terminal-surface': '#160832',
    '--color-terminal-surface-2': '#1d0a3f',
    '--color-terminal-border': '#3b1a6b',
    '--color-terminal-text': '#f4e6ff',
    '--color-terminal-muted': '#9a7fb8',
    '--color-terminal-green': '#ff2bd6',
    '--color-terminal-amber': '#ff9c00',
    '--color-terminal-cyan': '#00f0ff',
    '--color-terminal-error': '#ff3b6b',
  },
};

/** Deep navy with cool blue accents — calm, focused long sessions. */
export const midnightTheme: ClawSprawlTheme = {
  id: 'midnight',
  label: 'Midnight',
  description: 'Deep navy with cool blue accents.',
  themeColor: '#070d1a',
  tokens: {
    '--color-terminal-bg': '#070d1a',
    '--color-terminal-surface': '#0d1830',
    '--color-terminal-surface-2': '#11203f',
    '--color-terminal-border': '#1e3a66',
    '--color-terminal-text': '#d6e2ff',
    '--color-terminal-muted': '#7d93b8',
    '--color-terminal-green': '#5bd6a0',
    '--color-terminal-amber': '#ffb454',
    '--color-terminal-cyan': '#5ab8ff',
    '--color-terminal-error': '#ff6b81',
  },
};

/** Warm charcoal with amber/red accents — forge vibes. */
export const emberTheme: ClawSprawlTheme = {
  id: 'ember',
  label: 'Ember',
  description: 'Warm charcoal with amber/red accents — forge vibes.',
  themeColor: '#150a06',
  tokens: {
    '--color-terminal-bg': '#150a06',
    '--color-terminal-surface': '#1f120b',
    '--color-terminal-surface-2': '#2a1810',
    '--color-terminal-border': '#4a2a1a',
    '--color-terminal-text': '#f4e3d6',
    '--color-terminal-muted': '#a8896b',
    '--color-terminal-green': '#ffb454',
    '--color-terminal-amber': '#ff8c1a',
    '--color-terminal-cyan': '#ff6b3d',
    '--color-terminal-error': '#ff3b3b',
  },
};

/** Strict grayscale — accessibility-friendly, no chroma. */
export const monoTheme: ClawSprawlTheme = {
  id: 'mono',
  label: 'Mono',
  description: 'Strict grayscale — minimal and focused.',
  themeColor: '#0b0b0b',
  tokens: {
    '--color-terminal-bg': '#0b0b0b',
    '--color-terminal-surface': '#161616',
    '--color-terminal-surface-2': '#1c1c1c',
    '--color-terminal-border': '#3a3a3a',
    '--color-terminal-text': '#e8e8e8',
    '--color-terminal-muted': '#8a8a8a',
    '--color-terminal-green': '#c8c8c8',
    '--color-terminal-amber': '#a0a0a0',
    '--color-terminal-cyan': '#d0d0d0',
    '--color-terminal-error': '#ff5e5e',
  },
};

/** Hermes slate — neutral desaturated blue-gray for long sessions. */
export const slateTheme: ClawSprawlTheme = {
  id: 'slate',
  label: 'Slate',
  description: 'Desaturated blue-gray — focused developer theme.',
  themeColor: '#0f1419',
  tokens: {
    '--color-terminal-bg': '#0f1419',
    '--color-terminal-surface': '#161c24',
    '--color-terminal-surface-2': '#1c242e',
    '--color-terminal-border': '#2c3947',
    '--color-terminal-text': '#cdd6e0',
    '--color-terminal-muted': '#6b7886',
    '--color-terminal-green': '#7ee787',
    '--color-terminal-amber': '#e3b341',
    '--color-terminal-cyan': '#6cb6ff',
    '--color-terminal-error': '#ff7b72',
  },
};

/** All built-in themes in stable display order. */
export const BUILTIN_THEMES: ClawSprawlTheme[] = [
  sprawlTheme,
  cyberpunkTheme,
  midnightTheme,
  emberTheme,
  monoTheme,
  slateTheme,
];