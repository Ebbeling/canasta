import type { ThemePreference } from '@/application/ports';

/**
 * Applies the theme by setting `data-theme` on <html>.
 *
 * `system` removes the attribute entirely, so the `prefers-color-scheme` media
 * query in index.css takes over again.
 */
export function applyTheme(theme: ThemePreference): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;

  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
