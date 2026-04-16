/**
 * functions/preview/[type]/[slug].ts — Cloudflare Pages Function
 *
 * Serves draft content previews at /preview/{type}/{slug}.
 * Reads from the draft: KV prefix — never from content:.
 * Returns 404 if the draft does not exist.
 * Page is marked noindex and shows a draft banner.
 *
 * Required Cloudflare bindings (wrangler.jsonc):
 *   CONTENT  KV namespace — same binding used by the MCP server
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KVNamespace {
  get(key: string): Promise<string | null>;
}

interface Env {
  CONTENT: KVNamespace;
}

interface ContentItem {
  id: string;
  slug: string;
  title: string;
  body: string;
  contentType: string;
  excerpt?: string | null;
  date?: string | null;
  author?: string | null;
  status?: 'draft' | 'published';
}

interface PagesContext {
  request: Request;
  env: Env;
  params: { type: string; slug: string };
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

async function fetchStyleLinks(requestUrl: string): Promise<string> {
  try {
    const homeUrl = new URL('/', requestUrl).toString();
    const res = await fetch(homeUrl);
    if (!res.ok) return '';
    const html = await res.text();
    const links = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)];
    return links.map((m) => m[0]).join('\n  ');
  } catch {
    return '';
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPreview(item: ContentItem, type: string, styleLinks: string): string {
  const title = escapeHtml(item.title);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>[Draft] ${title}</title>
  ${styleLinks}
  <style>
    .draft-banner { background: #fef9ec; border: 2px solid #f0a500; border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 2rem; font-size: 0.9rem; color: #7a5500; display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
    .draft-label { font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; background: #f0a500; color: #fff; padding: 0.15em 0.5em; border-radius: 3px; flex-shrink: 0; }
    .back-link { display: inline-block; text-decoration: none; font-size: 0.9rem; margin-bottom: 1.5rem; text-transform: capitalize; }
  </style>
</head>
<body>
  <div class="draft-banner">
    <span class="draft-label">Draft Preview</span>
    This content has not been published.
  </div>
  <a class="back-link" href="/${escapeHtml(type)}/">← ${escapeHtml(type)}</a>
  <main>
    <h1>${title}</h1>
    ${item.body}
  </main>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function onRequestGet({ request, env, params }: PagesContext): Promise<Response> {
  const { type, slug } = params;
  const raw = await env.CONTENT.get(`draft:${type}:${slug}`);

  if (!raw) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const [item, styleLinks] = await Promise.all([
    Promise.resolve(JSON.parse(raw) as ContentItem),
    fetchStyleLinks(request.url),
  ]);

  return new Response(renderPreview(item, type, styleLinks), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
