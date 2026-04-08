/**
 * functions/api/mcp.ts — Cloudflare Pages Function
 *
 * Exposes Invert content via the Model Context Protocol (MCP) over HTTP.
 * Accessible at /api/mcp on the deployed Cloudflare Pages site.
 *
 * Write model
 * -----------
 * Writes go to Cloudflare KV immediately (content is readable at once), then
 * fire an async GitHub API commit so the git repo stays in sync. GitHub Actions
 * rebuilds the static site when the commit lands (~1-2 min delay for the web
 * pages, zero delay for MCP reads).
 *
 * Read model
 * ----------
 * Reads merge the KV index with the static manifest (dist/_api/content.json).
 * KV wins for any item that exists in both (KV always has the freshest version).
 *
 * Required environment variables (set in Cloudflare Pages dashboard or wrangler.toml):
 *   GITHUB_TOKEN   GitHub PAT with repo write access (Contents: read & write)
 *   GITHUB_REPO    e.g. "jazzsequence/dragonfly"
 *   GITHUB_BRANCH  default "main"
 *
 * Required Cloudflare bindings (wrangler.jsonc):
 *   CONTENT  KV namespace  (npx wrangler kv namespace create CONTENT)
 *   ASSETS   Pages asset binding (automatic)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentItem {
  id: string;
  slug: string;
  title: string;
  contentType: string;
  body?: string;
  excerpt?: string | null;
  date?: string | null;
  author?: string | null;
  featuredImage?: string | null;
  taxonomies?: Record<string, string[]>;
  meta?: Record<string, unknown>;
}

interface IndexEntry {
  type: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  date?: string | null;
  author?: string | null;
}

interface StaticManifest {
  items: ContentItem[];
  generatedAt: string;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  CONTENT: KVNamespace;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
}

// ---------------------------------------------------------------------------
// KV helpers
// ---------------------------------------------------------------------------

const KV_INDEX = '_index';

function kvKey(contentType: string, slug: string) {
  return `content:${contentType}:${slug}`;
}

async function kvGetIndex(env: Env): Promise<IndexEntry[]> {
  const raw = await env.CONTENT.get(KV_INDEX);
  return raw ? (JSON.parse(raw) as IndexEntry[]) : [];
}

async function kvSetIndex(env: Env, index: IndexEntry[]): Promise<void> {
  await env.CONTENT.put(KV_INDEX, JSON.stringify(index));
}

async function kvGetItem(env: Env, contentType: string, slug: string): Promise<ContentItem | null> {
  const raw = await env.CONTENT.get(kvKey(contentType, slug));
  return raw ? (JSON.parse(raw) as ContentItem) : null;
}

async function kvPutItem(env: Env, item: ContentItem): Promise<void> {
  await env.CONTENT.put(kvKey(item.contentType, item.slug), JSON.stringify(item));

  // Update index
  const index = await kvGetIndex(env);
  const existing = index.findIndex(
    (e) => e.type === item.contentType && e.slug === item.slug
  );
  const entry: IndexEntry = {
    type: item.contentType,
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt ?? null,
    date: item.date ?? null,
    author: item.author ?? null,
  };
  if (existing >= 0) {
    index[existing] = entry;
  } else {
    index.push(entry);
  }
  await kvSetIndex(env, index);
}

async function kvDeleteItem(env: Env, contentType: string, slug: string): Promise<boolean> {
  const existing = await kvGetItem(env, contentType, slug);
  if (!existing) return false;
  await env.CONTENT.delete(kvKey(contentType, slug));
  const index = await kvGetIndex(env);
  await kvSetIndex(
    env,
    index.filter((e) => !(e.type === contentType && e.slug === slug))
  );
  return true;
}

// ---------------------------------------------------------------------------
// Static manifest fallback
// ---------------------------------------------------------------------------

async function getStaticManifest(env: Env, requestUrl: string): Promise<ContentItem[]> {
  try {
    const origin = new URL(requestUrl).origin;
    const res = await env.ASSETS.fetch(`${origin}/_api/content.json`);
    if (!res.ok) return [];
    const manifest = (await res.json()) as StaticManifest;
    return manifest.items ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Merged content reads (KV wins over static manifest)
// ---------------------------------------------------------------------------

async function getAllItems(env: Env, requestUrl: string): Promise<ContentItem[]> {
  const [kvIndex, staticItems] = await Promise.all([
    kvGetIndex(env),
    getStaticManifest(env, requestUrl),
  ]);

  // Start with static items, then layer KV on top
  const merged = new Map<string, ContentItem>();
  for (const item of staticItems) {
    merged.set(`${item.contentType}:${item.slug}`, item);
  }
  // KV index entries mark items that exist in KV; fetch full items for those
  // that overlap with static, and add new KV-only items as lightweight stubs.
  for (const entry of kvIndex) {
    const key = `${entry.type}:${entry.slug}`;
    // Use a lightweight stub so invert_list is fast — invert_get fetches the full item
    merged.set(key, {
      id: entry.slug,
      slug: entry.slug,
      title: entry.title,
      contentType: entry.type,
      excerpt: entry.excerpt ?? null,
      date: entry.date ?? null,
      author: entry.author ?? null,
    });
  }
  return [...merged.values()];
}

// ---------------------------------------------------------------------------
// GitHub API write-back (fire-and-forget)
// ---------------------------------------------------------------------------

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function githubCommit(
  env: Env,
  action: 'upsert' | 'delete',
  contentType: string,
  slug: string,
  item?: ContentItem
): Promise<void> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return;

  const branch = env.GITHUB_BRANCH ?? 'main';
  const path = `content/${contentType}/${slug}.json`;
  const apiUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const headers = {
    Authorization: `token ${env.GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'invert-mcp/0.1.0',
    Accept: 'application/vnd.github+json',
  };

  // Fetch current SHA (needed for update/delete; absent for new files)
  let sha: string | undefined;
  try {
    const res = await fetch(apiUrl, { headers });
    if (res.ok) {
      const data = (await res.json()) as { sha: string };
      sha = data.sha;
    }
  } catch {
    // File may not exist yet — that's fine for creates
  }

  if (action === 'delete') {
    if (!sha) return; // Nothing to delete
    await fetch(apiUrl, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        message: `content: delete ${contentType}/${slug}`,
        sha,
        branch,
      }),
    });
    return;
  }

  // Upsert
  await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `content: ${sha ? 'update' : 'create'} ${contentType}/${slug}`,
      content: toBase64(JSON.stringify(item, null, 2)),
      ...(sha ? { sha } : {}),
      branch,
    }),
  });
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function toolList(
  env: Env,
  requestUrl: string,
  args: { contentType?: string; limit?: number; offset?: number }
): Promise<ContentItem[]> {
  const items = await getAllItems(env, requestUrl);
  const { contentType, limit = 20, offset = 0 } = args;
  const filtered = contentType ? items.filter((i) => i.contentType === contentType) : items;
  return filtered.slice(offset, offset + limit);
}

async function toolGet(
  env: Env,
  requestUrl: string,
  args: { contentType: string; slug: string }
): Promise<ContentItem | null> {
  // KV first (full item), then static manifest
  const fromKV = await kvGetItem(env, args.contentType, args.slug);
  if (fromKV) return fromKV;
  const staticItems = await getStaticManifest(env, requestUrl);
  return staticItems.find((i) => i.contentType === args.contentType && i.slug === args.slug) ?? null;
}

async function toolSearch(
  env: Env,
  requestUrl: string,
  args: { query: string }
): Promise<ContentItem[]> {
  const items = await getAllItems(env, requestUrl);
  const q = args.query.toLowerCase();
  return items.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      (i.body ?? '').toLowerCase().includes(q) ||
      (i.excerpt ?? '').toLowerCase().includes(q)
  );
}

async function toolTypes(env: Env, requestUrl: string): Promise<string[]> {
  const items = await getAllItems(env, requestUrl);
  return [...new Set(items.map((i) => i.contentType))];
}

async function toolCreate(
  env: Env,
  item: ContentItem
): Promise<{ path: string; githubSync: boolean }> {
  await kvPutItem(env, item);
  // Fire-and-forget GitHub commit
  const syncPromise = githubCommit(env, 'upsert', item.contentType, item.slug, item);
  void syncPromise.catch(() => {}); // don't block on GitHub errors
  return {
    path: `content/${item.contentType}/${item.slug}.json`,
    githubSync: !!(env.GITHUB_TOKEN && env.GITHUB_REPO),
  };
}

async function toolUpdate(
  env: Env,
  requestUrl: string,
  args: { contentType: string; slug: string; updates: Partial<ContentItem> }
): Promise<ContentItem | null> {
  const existing = await toolGet(env, requestUrl, { contentType: args.contentType, slug: args.slug });
  if (!existing) return null;
  const updated: ContentItem = { ...existing, ...args.updates };
  await kvPutItem(env, updated);
  void githubCommit(env, 'upsert', updated.contentType, updated.slug, updated).catch(() => {});
  return updated;
}

async function toolDelete(
  env: Env,
  args: { contentType: string; slug: string }
): Promise<{ deleted: boolean; githubSync: boolean }> {
  const deleted = await kvDeleteItem(env, args.contentType, args.slug);
  if (deleted) {
    void githubCommit(env, 'delete', args.contentType, args.slug).catch(() => {});
  }
  return { deleted, githubSync: !!(env.GITHUB_TOKEN && env.GITHUB_REPO) };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'invert_list',
    description: 'List content items, optionally filtered by type.',
    inputSchema: {
      type: 'object',
      properties: {
        contentType: { type: 'string', description: 'Filter by content type (e.g. "posts", "docs")' },
        limit: { type: 'number', description: 'Maximum results (default: 20)' },
        offset: { type: 'number', description: 'Pagination offset (default: 0)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'invert_get',
    description: 'Get a single content item by type and slug.',
    inputSchema: {
      type: 'object',
      properties: {
        contentType: { type: 'string' },
        slug: { type: 'string' },
      },
      required: ['contentType', 'slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'invert_search',
    description: 'Full-text search across all content (title, body, excerpt).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'invert_types',
    description: 'List all available content types.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'invert_create',
    description: 'Create a new content item. Writes to Cloudflare KV immediately and commits to GitHub asynchronously.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        slug: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        contentType: { type: 'string' },
        date: { type: 'string' },
        author: { type: 'string' },
        excerpt: { type: 'string' },
        featuredImage: { type: 'string' },
        taxonomies: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
        meta: { type: 'object', additionalProperties: true },
      },
      required: ['id', 'slug', 'title', 'body', 'contentType'],
      additionalProperties: false,
    },
  },
  {
    name: 'invert_update',
    description: 'Update an existing content item. Writes to KV immediately and commits to GitHub asynchronously.',
    inputSchema: {
      type: 'object',
      properties: {
        contentType: { type: 'string' },
        slug: { type: 'string' },
        updates: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' },
            date: { type: 'string' },
            author: { type: 'string' },
            excerpt: { type: 'string' },
            featuredImage: { type: 'string' },
            taxonomies: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
            meta: { type: 'object', additionalProperties: true },
          },
          additionalProperties: false,
        },
      },
      required: ['contentType', 'slug', 'updates'],
      additionalProperties: false,
    },
  },
  {
    name: 'invert_delete',
    description: 'Delete a content item from KV and commit the deletion to GitHub.',
    inputSchema: {
      type: 'object',
      properties: {
        contentType: { type: 'string' },
        slug: { type: 'string' },
      },
      required: ['contentType', 'slug'],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// JSON-RPC dispatcher
// ---------------------------------------------------------------------------

function ok(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: '2.0', id, result });
}

function err(id: unknown, code: number, message: string): Response {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(content: unknown): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(content, null, 2) }] };
}

async function dispatch(
  msg: { method: string; params?: Record<string, unknown>; id?: unknown },
  env: Env,
  requestUrl: string
): Promise<Response> {
  const { method, params = {}, id } = msg;

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'dragonfly', version: '0.1.0' },
      });

    case 'notifications/initialized':
      return new Response(null, { status: 202 });

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: TOOLS });

    case 'tools/call': {
      const name = params.name as string;
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        switch (name) {
          case 'invert_list':
            return ok(id, text(await toolList(env, requestUrl, args as Parameters<typeof toolList>[2])));
          case 'invert_get': {
            const item = await toolGet(env, requestUrl, args as Parameters<typeof toolGet>[2]);
            if (!item) return ok(id, { content: [{ type: 'text', text: 'Not found' }], isError: true });
            return ok(id, text(item));
          }
          case 'invert_search':
            return ok(id, text(await toolSearch(env, requestUrl, args as Parameters<typeof toolSearch>[2])));
          case 'invert_types':
            return ok(id, text(await toolTypes(env, requestUrl)));
          case 'invert_create': {
            const result = await toolCreate(env, args as ContentItem);
            const note = result.githubSync ? ' GitHub sync queued.' : ' Warning: GITHUB_TOKEN not set — content will not survive a site rebuild.';
            return ok(id, { content: [{ type: 'text', text: `Created: ${result.path}.${note}` }] });
          }
          case 'invert_update': {
            const updated = await toolUpdate(env, requestUrl, args as Parameters<typeof toolUpdate>[2]);
            if (!updated) return ok(id, { content: [{ type: 'text', text: 'Not found' }], isError: true });
            return ok(id, text(updated));
          }
          case 'invert_delete': {
            const result = await toolDelete(env, args as Parameters<typeof toolDelete>[2]);
            const note = result.githubSync ? ' GitHub sync queued.' : ' Warning: GITHUB_TOKEN not set.';
            return ok(id, { content: [{ type: 'text', text: result.deleted ? `Deleted.${note}` : 'Not found.' }] });
          }
          default:
            return err(id, -32601, `Unknown tool: ${name}`);
        }
      } catch (e) {
        return ok(id, { content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true });
      }
    }

    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Pages Function entry point
// ---------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    return withCors(
      Response.json({
        name: 'dragonfly',
        version: '0.1.0',
        transport: 'http',
        tools: TOOLS.map((t) => t.name),
        writeSync: !!(env.GITHUB_TOKEN && env.GITHUB_REPO),
      })
    );
  }

  if (request.method !== 'POST') {
    return withCors(new Response('Method Not Allowed', { status: 405 }));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(err(null, -32700, 'Parse error: invalid JSON'));
  }

  if (Array.isArray(body)) {
    const results = await Promise.all(
      body.map((msg) =>
        dispatch(msg as Parameters<typeof dispatch>[0], env, request.url).then((r) => r.json())
      )
    );
    return withCors(Response.json(results));
  }

  return withCors(await dispatch(body as Parameters<typeof dispatch>[0], env, request.url));
}
