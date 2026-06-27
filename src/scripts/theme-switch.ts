import { BUILTIN_THEMES } from '../config/themes/presets';
import { THEME_STORAGE_KEY } from '../config/themes/types';

interface ThemePreset {
  id: string;
  label: string;
  themeColor: string;
  tokens: Record<string, string>;
}

const PRESETS: Record<string, ThemePreset> = Object.fromEntries(
  BUILTIN_THEMES.map((t) => [t.id, {
    id: t.id, label: t.label, themeColor: t.themeColor,   tokens: t.tokens,
  }]),
);

const VARS_STYLE_ID = 'cs-theme-vars';

function applyTheme(id: string): void {
  const preset = PRESETS[id];
  if (!preset) return;
  const root = document.documentElement;
  root.setAttribute('data-cs-theme', preset.id);

  let styleEl = document.getElementById(VARS_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = VARS_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  const body = Object.entries(preset.tokens)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  styleEl.textContent = `:root[data-cs-theme="${preset.id}"]{${body}}`;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', preset.themeColor);

  const select = document.getElementById('cs-theme-select') as HTMLSelectElement | null;
  if (select) select.value = id;
}

function persistTheme(id: string): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch { /* private mode */ }
}

function readStoredTheme(): string | null {
  try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
}

function init(): void {
  const stored = readStoredTheme();
  if (stored && PRESETS[stored]) applyTheme(stored);

  const select = document.getElementById('cs-theme-select') as HTMLSelectElement | null;
  if (select) {
    select.value = stored && PRESETS[stored] ? stored : (document.documentElement.getAttribute('data-cs-theme') ?? 'sprawl');
    select.addEventListener('change', () => {
      const id = select.value;
      applyTheme(id);
      persistTheme(id);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}