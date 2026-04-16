/**
 * functions/api/mcp/info.ts — Cloudflare Pages Function
 * Human-readable MCP server status. Accessible at /api/mcp/info
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface InfoEnv {
  SITE_NAME?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env }: { env: InfoEnv }): Promise<Response> {

  return new Response(
    JSON.stringify({
      name: env.SITE_NAME ?? 'invert',
      version: '0.1.0',
      transport: 'http',
      mcpEndpoint: '/api/mcp',
      tools: ['invert_list', 'invert_get', 'invert_search', 'invert_types', 'invert_create', 'invert_update', 'invert_delete', 'invert_publish'],
      writeSync: !!(env.GITHUB_TOKEN && env.GITHUB_REPO),
    }, null, 2),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
  );
}
