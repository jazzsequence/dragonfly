# Dragonfly — Claude Code Conventions

## What This Is
Dragonfly is a developer blog for the [Invert](https://github.com/jazzsequence/Invert) project.
It is built *on* Invert — a specific, deployed instance of the Invert template — not Invert itself.
It is not a template repo and is not meant for redistribution.

The site is live at **https://dragonfly.jazzsequence.com** (also **https://dragonfly-6tp.pages.dev**).

## Tech Stack
- **Framework**: Astro (static output — `output: 'static'`)
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js (≥ 22, use `nvm exec 22` for build commands)
- **Package Manager**: npm
- **Deployment**: Cloudflare Pages via GitHub Actions on push to `main`
- **Content storage**: Cloudflare KV (binding: `CONTENT`) for write-back from MCP
- **MCP**: Edge MCP server at `/api/mcp` via Cloudflare Pages Function

## Deployment Architecture
- `astro.config.mjs` uses `output: 'static'` — no SSR adapter
- Static site builds to `dist/`, deployed to Cloudflare Pages
- `scripts/cloudflare-prepare.mjs` runs post-build to reorganize `dist/` for Cloudflare Pages
- Cloudflare Pages Functions live in `functions/` — processed separately from the static site
- `functions/api/mcp/index.ts` — MCP HTTP endpoint (Cloudflare Pages Function format)
- `functions/api/mcp/info.ts` — `GET /api/mcp/info` status endpoint

## Critical: Do Not Break These
- **Never set `output: 'server'`** — this broke the site before. Cloudflare Workers have no
  filesystem access at runtime; all content reads must happen at build time via `getStaticPaths()`.
- **Never add `src/pages/api/mcp.ts`** — conflicts with static build; API routes live in `functions/`.
- **Never use `display: flex` or `display: grid` on `.content-header`** — the global `header {}`
  rule in Base.astro previously leaked into ContentBody's `<header>` element, creating a broken
  multi-column layout. The rule is scoped to `body > header` to prevent this.
- **Never use broad global CSS selectors** that would match elements inside components.

## MCP Endpoint
The edge MCP server runs as a Cloudflare Pages Function at `/api/mcp`.

- `POST /api/mcp` — MCP Streamable HTTP transport (tool calls)
- `GET /api/mcp` — returns 405 (correct per MCP spec)
- `GET /api/mcp/info` — human-readable status JSON (tool list + GitHub sync status)

Required environment variables (set in Cloudflare Pages dashboard):
- `GITHUB_TOKEN` — fine-grained PAT with Contents: read & write on this repo
- `GITHUB_REPO` — `jazzsequence/dragonfly`
- `GITHUB_BRANCH` — `main`
- `CONTENT` — KV namespace binding (configured in `wrangler.jsonc`)

Write model: KV first (immediate), async GitHub commit (eventual). Without `GITHUB_TOKEN`,
writes live only in KV and are lost on the next full rebuild.

## Connecting the MCP Server
Local (stdio) — uses `.mcp.json` in the project root:
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

Edge (HTTP) — connect to the deployed endpoint:
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

## Theme
Dragonfly uses a custom dark neon theme (`src/styles/theme.css`) overriding Invert defaults:
- Dark navy background (`#0d0d1a`) with neon cyan accent (`#00e5cc`)
- Fonts: Space Grotesk (sans), Geist (headings), Victor Mono (mono) via `@fontsource`
- No blink/flicker animations — they were removed; do not re-add them

## Content
Content types in use:
- `posts` — blog posts (JSON in `content/posts/`)
- `pages` — static pages like About (JSON in `content/pages/`)

Content is written via the MCP server (`invert_create`, `invert_update`) or directly as JSON files.
The disclosure note on posts should indicate when content was AI-generated.

## Commands
- `npm run dev` — Start Astro dev server
- `nvm exec 22 npm run build` — Build for production (use nvm exec, not nvm use)
- `npm run mcp` — Start local stdio MCP server

## File Layout (Dragonfly-specific)
```
content/           — JSON content files (posts, pages)
functions/
  api/mcp/
    index.ts       — Cloudflare Pages Function: MCP HTTP transport
    info.ts        — Cloudflare Pages Function: /api/mcp/info status
scripts/
  cloudflare-prepare.mjs  — post-build: reorganize dist/ for CF Pages
  generate-manifest.mjs   — generates /_api/content.json for edge reads
src/
  adapters/        — content adapters (JsonAdapter, MarkdownAdapter, DocsAdapter)
  layouts/
    Base.astro     — site shell; global header rule scoped to body > header
  components/
    ContentBody.astro  — single content page layout
    ContentCard.astro  — content listing card
  styles/
    theme.css      — dark neon CSS custom properties (no animations)
    global.css     — base element styles
  pages/
    index.astro    — homepage (posts list + docs TOC)
    [type]/
      index.astro  — content type listing
      [slug].astro — single content page
```

## Style
- TypeScript strict mode, no `any` unless absolutely necessary
- `async/await`, not `.then()` chains
- Minimal dependencies
- Scoped Astro `<style>` for component styles; `<style is:global>` only in Base.astro,
  and only for top-level site elements
