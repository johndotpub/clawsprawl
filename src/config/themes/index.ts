import { BUILTIN_THEMES, sprawlTheme } from './presets';
import { DEFAULT_THEME_ID } from './types';
import type { ClawSprawlTheme } from './types';

const themes: Record<string, ClawSprawlTheme> = Object.fromEntries(
  BUILTIN_THEMES.map((t) => [t.id, t]),
);

/** Return all registered theme IDs. */
export function listThemeIds(): string[] {
  return Object.keys(themes);
}

/** Return all registered themes in display order. */
export function listThemes(): ClawSprawlTheme[] {
  return BUILTIN_THEMES;
}

/** Resolve a theme by ID, falling back to the default. */
export function resolveTheme(id?: string | null): ClawSprawlTheme {
  if (id && themes[id]) return themes[id];
  return themes[DEFAULT_THEME_ID] ?? sprawlTheme;
}

/** Type guard: is this a known theme ID? */
export function isKnownTheme(id?: string | null): id is string {
  return typeof id === 'string' && id in themes;
}