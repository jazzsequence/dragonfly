/**
 * Build a site-root-relative URL that respects the configured base path.
 * Works whether BASE_URL is "/" (root) or "/invert" (project page).
 *
 * Usage: url('docs/getting-started') → "/invert/docs/getting-started"
 */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}
