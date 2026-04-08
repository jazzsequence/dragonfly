# Invert — Claude Code Conventions

## Project Overview
Invert is a database-less, adapter-driven content presentation layer built on Astro.
It renders content from any source (JSON files, markdown, CMS APIs, MCP) without
an admin panel. Content comes in, gets normalized to a common shape, and gets rendered.

## Tech Stack
- **Framework**: Astro (latest stable)
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js
- **Package Manager**: npm
- **Deployment**: Cloudflare Pages (PoC)
- **MCP**: Model Context Protocol server for AI tool integration

## Architecture Principles
1. **No database.** All content is JSON at rest or in transit.
2. **No admin panel.** Content is managed externally. Invert only reads and renders.
3. **Adapters are the integration point.** Each content source implements `InvertAdapter`.
4. **Content types are strings, not schemas.** The system doesn't enforce structure per type.
5. **MCP is first-class.** The MCP server is not an afterthought — it's a core feature.

## Content Shape
All content normalizes to `InvertContent` (see src/adapters/interface.ts).
Required fields: id, slug, title, body, contentType.
Everything else is optional. Use `meta` for arbitrary pass-through data.

## Adapter Rules
- Adapters implement the `InvertAdapter` interface
- Adapters are registered in src/lib/config.ts
- Multiple adapters can run simultaneously — content merges from all sources
- Adapters handle their own data fetching and transformation
- Adapters must return valid `InvertContent` objects

## File Conventions
- Content files: `content/[type]/[slug].json` or `content/[type]/[slug].md`
- Adapters: `src/adapters/[name].ts`
- MCP tools: `mcp/tools.ts`
- Pages use Astro dynamic routes: `[type]/[slug].astro`

## Commands
- `npm run dev` — Start Astro dev server
- `npm run build` — Build for production
- `npm run preview` — Preview production build
- `npm run mcp` — Start MCP server (separate process)

## Style
- TypeScript strict mode, no `any` unless absolutely necessary
- Prefer explicit types over inference for function signatures
- Use async/await, not .then() chains
- Keep adapters self-contained — no cross-adapter dependencies
- Minimal dependencies — don't add packages for things the platform provides

## What NOT to Build
- No admin panel, dashboard, or management UI
- No user authentication or sessions
- No database connections or ORMs
- No image processing pipeline (reference images by URL/path)
- No plugin system beyond adapters

## Distribution
This repo is a GitHub template repo. Users click "Use this template" to create
their own site. The repo must always be in a state where a fresh clone, npm install,
and npm run dev produces a working site with example content. Never break this flow.