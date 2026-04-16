/**
 * functions/api/mcp/info.ts — Cloudflare Pages Function
 *
 * Human-readable status page for the edge MCP server.
 * Returns tool names and whether GitHub write-back sync is configured.
 *
 * Accessible at /api/mcp/info on the deployed Cloudflare Pages site.
 */

interface Env {
  GITHUB_TOKEN?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const TOOL_NAMES = [
  'invert_list',
  'invert_get',
  'invert_search',
  'invert_types',
  'invert_create',
  'invert_update',
  'invert_delete',
];

export async function onRequestGet({ env }: PagesContext): Promise<Response> {
  const githubSync = Boolean(env.GITHUB_TOKEN);

  const info = {
    server: 'Invert Edge MCP',
    transport: 'Streamable HTTP',
    endpoint: '/api/mcp',
    tools: TOOL_NAMES,
    githubSync,
    githubSyncNote: githubSync
      ? 'GITHUB_TOKEN is set — write operations will sync to git.'
      : 'GITHUB_TOKEN is not set — writes go to KV only and will be lost on next full rebuild.',
  };

  return new Response(JSON.stringify(info, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
