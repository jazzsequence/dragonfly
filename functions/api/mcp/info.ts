/**
 * functions/api/mcp/info.ts — Human-readable MCP server status
 * Accessible at /api/mcp/info
 */

interface Env {
  CONTENT: { get(key: string): Promise<string | null> };
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  SITE_NAME?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  return new Response(
    JSON.stringify({
      name: env.SITE_NAME ?? 'dragonfly',
      version: '0.1.0',
      transport: 'http',
      mcpEndpoint: '/api/mcp',
      tools: ['invert_list', 'invert_get', 'invert_search', 'invert_types', 'invert_create', 'invert_update', 'invert_delete'],
      writeSync: !!(env.GITHUB_TOKEN && env.GITHUB_REPO),
    }, null, 2),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
  );
}
