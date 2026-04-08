/**
 * functions/api/mcp.ts — Cloudflare Pages Function
 *
 * Exposes the Invert content via the Model Context Protocol (MCP) over HTTP.
 * Accessible at /api/mcp on the deployed Cloudflare Pages site.
 *
 * Architecture
 * ------------
 * This is a stateless JSON-RPC handler. Each POST request creates a fresh
 * MCP server, handles one message, and returns the response. No session state
 * is maintained between requests.
 *
 * Content is read from /_api/content.json — a manifest generated at build time
 * by scripts/generate-manifest.mjs — via the Cloudflare ASSETS binding.
 *
 * Supported tools (read-only — no filesystem write access on the edge):
 *   invert_list    List content items, optionally filtered by type
 *   invert_get     Get a single item by type and slug
 *   invert_search  Full-text search across title, body, and excerpt
 *   invert_types   List all content types present in the manifest
 *
 * MCP client connection
 * ---------------------
 * Add to your Claude Code (or other MCP client) config:
 *   {
 *     "mcpServers": {
 *       "dragonfly": {
 *         "url": "https://dragonfly.pages.dev/api/mcp"
 *       }
 *     }
 *   }
 */

interface ContentItem {
  id: string;
  slug: string;
  title: string;
  contentType: string;
  body?: string;
  excerpt?: string | null;
  date?: string | null;
  author?: string | null;
  [key: string]: unknown;
}

interface ContentManifest {
  items: ContentItem[];
  generatedAt: string;
}

interface Env {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
}

// ---------------------------------------------------------------------------
// Fetch content manifest from static assets
// ---------------------------------------------------------------------------

async function getManifest(env: Env, requestUrl: string): Promise<ContentManifest> {
  const origin = new URL(requestUrl).origin;
  const response = await env.ASSETS.fetch(`${origin}/_api/content.json`);
  if (!response.ok) {
    return { items: [], generatedAt: new Date().toISOString() };
  }
  return response.json() as Promise<ContentManifest>;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function toolList(
  env: Env,
  requestUrl: string,
  args: { contentType?: string; limit?: number; offset?: number }
): Promise<ContentItem[]> {
  const { items } = await getManifest(env, requestUrl);
  const { contentType, limit = 20, offset = 0 } = args;
  const filtered = contentType ? items.filter((i) => i.contentType === contentType) : items;
  return filtered.slice(offset, offset + limit);
}

async function toolGet(
  env: Env,
  requestUrl: string,
  args: { contentType: string; slug: string }
): Promise<ContentItem | null> {
  const { items } = await getManifest(env, requestUrl);
  return items.find((i) => i.contentType === args.contentType && i.slug === args.slug) ?? null;
}

async function toolSearch(
  env: Env,
  requestUrl: string,
  args: { query: string }
): Promise<ContentItem[]> {
  const { items } = await getManifest(env, requestUrl);
  const q = args.query.toLowerCase();
  return items.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      (i.body ?? '').toLowerCase().includes(q) ||
      (i.excerpt ?? '').toLowerCase().includes(q)
  );
}

async function toolTypes(env: Env, requestUrl: string): Promise<string[]> {
  const { items } = await getManifest(env, requestUrl);
  return [...new Set(items.map((i) => i.contentType))];
}

// ---------------------------------------------------------------------------
// Tool definitions (used in tools/list response)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'invert_list',
    description: 'List content items, optionally filtered by type.',
    inputSchema: {
      type: 'object',
      properties: {
        contentType: { type: 'string', description: 'Filter by content type (e.g. "posts", "docs")' },
        limit: { type: 'number', description: 'Maximum number of results (default: 20)' },
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
        contentType: { type: 'string', description: 'Content type (e.g. "posts")' },
        slug: { type: 'string', description: 'Content slug (e.g. "hello-world")' },
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
        query: { type: 'string', description: 'Search query' },
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
];

// ---------------------------------------------------------------------------
// JSON-RPC dispatcher
// ---------------------------------------------------------------------------

function jsonRpc(id: unknown, result: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result });
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

async function dispatch(
  message: { method: string; params?: Record<string, unknown>; id?: unknown },
  env: Env,
  requestUrl: string
): Promise<Response> {
  const { method, params = {}, id } = message;

  switch (method) {
    case 'initialize':
      return jsonRpc(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'dragonfly', version: '0.1.0' },
      });

    case 'notifications/initialized':
      return new Response(null, { status: 202 });

    case 'ping':
      return jsonRpc(id, {});

    case 'tools/list':
      return jsonRpc(id, { tools: TOOLS });

    case 'tools/call': {
      const name = params.name as string;
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        let result: unknown;
        switch (name) {
          case 'invert_list':
            result = await toolList(env, requestUrl, args as Parameters<typeof toolList>[2]);
            break;
          case 'invert_get':
            result = await toolGet(env, requestUrl, args as Parameters<typeof toolGet>[2]);
            break;
          case 'invert_search':
            result = await toolSearch(env, requestUrl, args as Parameters<typeof toolSearch>[2]);
            break;
          case 'invert_types':
            result = await toolTypes(env, requestUrl);
            break;
          default:
            return jsonRpcError(id, -32601, `Unknown tool: ${name}`);
        }
        return jsonRpc(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonRpc(id, {
          content: [{ type: 'text', text: `Error: ${msg}` }],
          isError: true,
        });
      }
    }

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Pages Function handler
// ---------------------------------------------------------------------------

export async function onRequest(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const { request, env } = context;

  // CORS — allow AI tools and local MCP clients to connect
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET — basic health / discovery endpoint
  if (request.method === 'GET') {
    return Response.json(
      {
        name: 'dragonfly',
        version: '0.1.0',
        transport: 'http',
        description: 'Invert MCP server — read-only content access over HTTP.',
        tools: TOOLS.map((t) => t.name),
      },
      { headers: corsHeaders }
    );
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, 'Parse error: invalid JSON');
  }

  const addCors = (res: Response): Response => {
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  };

  // Batch request
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((msg) => dispatch(msg as Parameters<typeof dispatch>[0], env, request.url))
    );
    const results = await Promise.all(responses.map((r) => r.json()));
    return addCors(Response.json(results));
  }

  // Single request
  const response = await dispatch(
    body as Parameters<typeof dispatch>[0],
    env,
    request.url
  );
  return addCors(response);
}
