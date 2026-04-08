# Dragonfly

A developer blog for the [Invert](https://github.com/jazzsequence/Invert) project, built on Invert and deployed to Cloudflare Pages.

**Live site**: https://dragonfly.jazzsequence.com

## What This Is

Dragonfly is a specific, deployed instance of Invert — not the Invert template itself. It exists to demonstrate Invert in production and to write about its development. Posts are written via the Invert MCP server (AI-assisted or directly) and published via git push.

## Requirements

- Node.js >= 22 (use [nvm](https://github.com/nvm-sh/nvm): `nvm use`)

## Local Development

```bash
npm install
npm run dev
```

Site runs at `http://localhost:4321`.

## Content

Content lives in `content/` as JSON files:

```
content/
  posts/     → /posts/[slug]
  pages/     → /pages/[slug]
```

A content file looks like:

```json
{
  "id": "my-post",
  "slug": "my-post",
  "title": "My Post",
  "body": "<p>Content here.</p>",
  "contentType": "posts",
  "date": "2026-04-06",
  "author": "Chris Reynolds",
  "excerpt": "Short summary.",
  "taxonomies": {
    "tags": ["invert", "astro"]
  }
}
```

## Writing via MCP

The local MCP server reads and writes content directly to `content/`:

```bash
npm run mcp
```

Connect it to Claude Desktop or Claude Code via `.mcp.json`:

```json
{
  "mcpServers": {
    "dragonfly": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/dragonfly"
    }
  }
}
```

The deployed edge MCP server is available at:

```
https://dragonfly.jazzsequence.com/api/mcp
```

Edge writes go to Cloudflare KV immediately and sync back to git asynchronously via GitHub API. Connect via Claude Code:

```bash
claude mcp add --transport http dragonfly https://dragonfly.jazzsequence.com/api/mcp
```

Or manually in `.mcp.json`:

```json
{
  "mcpServers": {
    "dragonfly": {
      "type": "http",
      "url": "https://dragonfly.jazzsequence.com/api/mcp"
    }
  }
}
```

Check edge server status at `https://dragonfly.jazzsequence.com/api/mcp/info`.

## Deployment

Deploys automatically to Cloudflare Pages on push to `main` via GitHub Actions.

The build is static (`output: 'static'`). The MCP endpoint runs as a Cloudflare Pages Function in `functions/api/mcp/` — separate from the static site.

Required environment variables in the Cloudflare Pages dashboard:

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | Fine-grained PAT with Contents: read & write |
| `GITHUB_REPO` | `jazzsequence/dragonfly` |
| `GITHUB_BRANCH` | `main` |
| `CONTENT` | KV namespace binding (set in `wrangler.jsonc`) |

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server at `localhost:4321` |
| `nvm exec 22 npm run build` | Build for production |
| `npm run mcp` | Start local MCP server (stdio) |

## Project Structure

```
dragonfly/
├── astro.config.mjs              # Astro config (output: 'static')
├── wrangler.jsonc                # Cloudflare Pages / KV config
├── CLAUDE.md                     # Claude Code conventions
├── content/                      # JSON content files (MCP-writable)
│   ├── posts/
│   └── pages/
├── functions/
│   └── api/mcp/
│       ├── index.ts              # MCP HTTP endpoint (Cloudflare Pages Function)
│       └── info.ts               # GET /api/mcp/info status endpoint
├── scripts/
│   ├── cloudflare-prepare.mjs   # Post-build: reorganizes dist/ for CF Pages
│   └── generate-manifest.mjs    # Generates /_api/content.json for edge reads
├── src/
│   ├── adapters/                 # Content adapters
│   ├── lib/
│   │   ├── config.ts             # Site config + adapter registration
│   │   ├── content.ts            # Content query helpers
│   │   └── utils.ts              # URL helpers
│   ├── layouts/
│   │   └── Base.astro            # Site shell
│   ├── components/
│   │   ├── ContentBody.astro     # Single content page
│   │   └── ContentCard.astro     # Listing card
│   ├── styles/
│   │   ├── theme.css             # Dark neon theme variables
│   │   └── global.css            # Base element styles
│   └── pages/
│       ├── index.astro           # Homepage
│       └── [type]/
│           ├── index.astro       # Content type listing
│           └── [slug].astro      # Individual content page
└── mcp/
    ├── server.ts                 # Local MCP server entry point
    └── tools.ts                  # MCP tool implementations
```

## Author

[Chris Reynolds](https://next.jazzsequence.com) ([@jazzsequence](https://github.com/jazzsequence))
