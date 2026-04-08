# Invert

A database-less, adapter-driven content presentation layer built on Astro. Invert renders content from any source — JSON files, markdown, a WordPress site, a Drupal site, an AI tool over MCP — without an admin panel, without a database, and without opinions about where your content lives.

There is no admin. That's the point. If there's no admin, then the admin can be anything.

## Philosophy

The presentation layer and the content management layer are separate concerns. Conflating them is the mistake the industry keeps making.

Invert doesn't replace your CMS. It sits in front of it — or in front of no CMS at all. Content comes in from adapters, gets normalized into a common JSON shape, and gets rendered. Where the content comes from is not Invert's problem. That's yours.

You can use WordPress and keep your admin panel. You can commit markdown to a git repo. You can talk to an AI tool over MCP and let it create content as JSON files. You can do all three at the same time. The choice is yours.

An [inversion](https://en.wikipedia.org/wiki/Inversion_(circus_arts)) is when you flip yourself upside down — a fundamental move in aerial arts. You hold your whole body weight in your hands while you rotate 180 degrees. It's a test of grip and strength. In this context, Invert means: look at the same stuff from a different angle. We don't have to throw our toys away. We can have new things and still honor the old things.

## Requirements

- Node.js >= 22.12.0 (use [nvm](https://github.com/nvm-sh/nvm): `nvm use`)

## Quick Start

1. Click **"Use this template"** on GitHub to create your own repository
2. Clone your new repo locally
3. Install dependencies:

```bash
npm install
```

4. Start the dev server:

```bash
npm run dev
```

Your site is running at `http://localhost:4321`.

## Adding Content

### JSON Files

Drop `.json` files into `content/[type]/[slug].json`. The directory name is the content type; the filename is the slug.

```
content/
  posts/
    my-post.json        → /posts/my-post
  pages/
    about.json          → /pages/about
```

A content file:

```json
{
  "id": "my-post",
  "slug": "my-post",
  "title": "My Post",
  "body": "<p>Content here.</p>",
  "contentType": "posts",
  "date": "2026-04-06",
  "author": "Chris",
  "taxonomies": {
    "tags": ["example"]
  }
}
```

### Markdown Files

Drop `.md` files into `markdown/` with YAML frontmatter:

```markdown
---
title: My Post
slug: my-post
contentType: posts
date: 2026-04-06
author: Chris
tags: [example]
---

Content here.
```

### Remote Markdown (GitHub)

Point the markdown adapter at a GitHub repository and Invert pulls content from it at build time:

```typescript
// src/lib/config.ts
new MarkdownAdapter({
  source: 'github',
  repo: 'your-org/your-repo',
  contentDir: 'content',
  branch: 'main',
  token: process.env.GITHUB_TOKEN, // optional, for private repos
})
```

### MCP (AI Tools)

Start the MCP server and connect it to Claude Desktop or any MCP-compatible tool:

```bash
npm run mcp
```

The AI tool can then create, read, update, and search content. Write operations produce JSON files in `content/` — the JSON adapter's write path. Markdown files (`markdown/`, `docs/`) are treated as externally managed source files and are not writable via MCP. See [MCP write path](#mcp-write-path) below.

## Configuration

All configuration lives in `src/lib/config.ts`:

```typescript
import { join } from 'node:path';
import { JsonAdapter } from '../adapters/json.ts';
import { MarkdownAdapter } from '../adapters/markdown.ts';
import { DocsAdapter } from '../adapters/docs.ts';

const root = process.cwd();

export const invertConfig = {
  siteName: 'My Site',
  siteUrl: 'https://example.com',

  adapters: [
    new JsonAdapter({ contentDir: join(root, 'content') }),
    new MarkdownAdapter({ source: 'local', contentDir: join(root, 'markdown') }),
    new DocsAdapter({ contentDir: join(root, 'docs') }),
  ],
};
```

Paths must be absolute — use `join(root, '...')` where `root = process.cwd()`. Relative paths fail during Astro's static build phase.

Multiple adapters run simultaneously. Content merges from all sources. If two adapters return content with the same `contentType` and `slug`, the first adapter in the array wins.

## Content Shape

All content from all adapters normalizes to `InvertContent`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier |
| `slug` | string | yes | URL slug — used in routing |
| `title` | string | yes | Display title |
| `body` | string | yes | HTML string |
| `contentType` | string | yes | e.g., `"posts"`, `"pages"`, `"docs"` |
| `date` | string | no | ISO 8601 date |
| `modified` | string | no | ISO 8601 date |
| `author` | string | no | Author name |
| `excerpt` | string | no | Short summary |
| `featuredImage` | string | no | URL or path to image |
| `taxonomies` | object | no | e.g., `{ tags: ["a", "b"] }` |
| `meta` | object | no | Arbitrary pass-through data |

Content types are strings. There is no structural difference between a "post" and a "page" and a "recipe." The system doesn't enforce schemas — that's the adapter's job.

## Routing

- `/` — Landing page
- `/[type]/` — All content of a given type (e.g., `/posts/`, `/docs/`)
- `/[type]/[slug]` — Individual content item (e.g., `/docs/getting-started`)

Routes are generated at build time from whatever adapters return. No configuration needed.

## MCP Server

Invert includes a Model Context Protocol server for AI tool integration (`mcp/server.ts`).

### Read Tools

| Tool | Description |
|------|-------------|
| `invert_list` | List content, optionally filtered by type and paginated |
| `invert_get` | Get a single content item by type and slug |
| `invert_search` | Full-text search across title, body, excerpt |
| `invert_types` | List all available content types |

### Write Tools

| Tool | Description |
|------|-------------|
| `invert_create` | Create a new content item |
| `invert_update` | Update an existing content item |
| `invert_delete` | Delete a content item |

### MCP Write Path

Write tools create and modify JSON files in `content/` only. This is intentional.

Invert treats `content/` (JSON files) as the AI-writable layer. Markdown files in `markdown/` and `docs/` are externally managed — written by humans, pulled from git, or fetched from a remote source. The separation is the point: if you want an AI tool to author structured content items, it goes through MCP into `content/`. If you want to manage documentation or long-form writing, you edit the markdown files directly or in your source repo.

Changes written via MCP appear on the site after a rebuild, or immediately in dev mode with hot reload.

### Connecting to Claude Desktop

```json
{
  "mcpServers": {
    "invert": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/your/site"
    }
  }
}
```

## Adapters

### Built-in

- **JsonAdapter** — Reads `.json` files from a local directory. Directory structure maps to content types.
- **MarkdownAdapter** — Reads `.md` files with YAML frontmatter. Supports local directories and remote GitHub repos.
- **DocsAdapter** — Reads markdown from a `docs/` directory and forces `contentType: "docs"`. Ships as a worked example of building a custom adapter — see `src/adapters/docs.ts`.

### Writing Your Own

`DocsAdapter` is the reference implementation. The minimum viable adapter:

```typescript
import type { InvertAdapter, InvertContent } from './interface.ts';

export class MyAdapter implements InvertAdapter {
  name = 'my-adapter';

  async getAll(): Promise<InvertContent[]> {
    return []; // fetch and return InvertContent[]
  }

  async getBySlug(slug: string): Promise<InvertContent | null> {
    const all = await this.getAll();
    return all.find((c) => c.slug === slug) ?? null;
  }

  async getByType(contentType: string): Promise<InvertContent[]> {
    const all = await this.getAll();
    return all.filter((c) => c.contentType === contentType);
  }
}
```

Register it in `src/lib/config.ts` alongside existing adapters.

### Planned

- **WordPress REST API** — Fetch posts, pages, and CPTs from a WordPress site
- **Drupal JSON:API** — Fetch content entities from Drupal
- **Content Publisher** — Pantheon Content Publisher for Google Docs workflows
- **RSS/Atom** — Feed entries as content items
- **Generic HTTP** — Configurable adapter for any JSON API

## Deployment

Invert builds to a static `dist/` directory. No server-side runtime required.

### GitHub Pages

The included `.github/workflows/deploy-docs.yml` builds and deploys on push to `main`. Enable Pages in your repo settings (Settings → Pages → Source: GitHub Actions).

For project pages (e.g. `username.github.io/repo-name`), the workflow sets `SITE_BASE` automatically from the repo name. For a custom domain, remove the `SITE_BASE` env var from the workflow.

### Cloudflare Pages

Connect your GitHub repo in the Cloudflare Pages dashboard:
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `NODE_VERSION = 22`

### Other Platforms

Any static host works: Netlify, Vercel, S3, etc. Run `npm run build` and deploy `dist/`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Astro dev server at `localhost:4321` |
| `npm run build` | Build for production to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run mcp` | Start the MCP server (stdio transport) |

## Project Structure

```
invert/
├── astro.config.mjs             # Astro configuration
├── CLAUDE.md                    # Claude Code conventions
├── docs/                        # Project documentation (rendered via DocsAdapter)
│   ├── ARCHITECTURE.md
│   ├── getting-started.md
│   ├── adapters.md
│   ├── content-shape.md
│   └── mcp.md
├── src/
│   ├── adapters/
│   │   ├── interface.ts         # InvertAdapter + InvertContent types
│   │   ├── json.ts              # JSON file adapter
│   │   ├── markdown.ts          # Markdown adapter (local + GitHub)
│   │   └── docs.ts              # DocsAdapter — custom adapter example
│   ├── lib/
│   │   ├── config.ts            # Site config + adapter registration
│   │   ├── content.ts           # Content query helpers
│   │   └── utils.ts             # URL helper for base-path-aware links
│   ├── layouts/
│   │   └── Base.astro           # Base HTML layout
│   ├── pages/
│   │   ├── index.astro          # Landing page
│   │   ├── [type]/
│   │   │   ├── index.astro      # Content type listing
│   │   │   └── [slug].astro     # Individual content page
│   │   └── 404.astro
│   └── components/
│       ├── ContentCard.astro    # Listing card
│       └── ContentBody.astro    # Content body renderer
├── mcp/
│   ├── server.ts                # MCP server entry point
│   └── tools.ts                 # MCP tool implementations
├── webhooks/
│   └── rebuild.ts               # Git push webhook listener scaffold
├── content/                     # JSON content (MCP-writable)
├── markdown/                    # Markdown content (human-managed)
└── public/                      # Static assets
```

## License

MIT

## Author

[Chris Reynolds](https://next.jazzsequence.com) ([@jazzsequence](https://github.com/jazzsequence))
