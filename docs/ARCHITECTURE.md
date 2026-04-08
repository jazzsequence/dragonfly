---
title: Invert — Architecture
slug: architecture
contentType: docs
date: 2026-04-06
excerpt: How Invert works — adapter-driven content presentation, the content shape, MCP integration, and deployment.
---

# Invert

> An inversion is when you flip yourself upside down. You hold your whole body weight in your hands and arms while you flip 180 degrees in relation to the ground. It's a fundamental move in all of aerials — a test of grip and strength. In this context, Invert also means "go back" or "flip around" or "look at the environment from a different angle." It's all the same stuff. We don't have to throw our toys away. We can have new things and still honor the old things.

## What This Is

Invert is a database-less, headless, adapter-driven content presentation layer built on Astro. It is not a CMS. It is the thing that sits in front of your CMS — or in front of no CMS at all — and renders content from any source.

There is no admin panel. There is no database. Content comes in as JSON. Where that JSON comes from is not Invert's problem — that's what adapters are for. An adapter can pull from a WordPress REST API, parse markdown files from a git repository, read from Drupal's JSON:API, accept structured input over MCP from an AI tool, or simply read static JSON files from disk.

Invert is a proof-of-concept and a statement. The statement: the presentation layer and the content management layer are separate concerns. Conflating them is the mistake the industry keeps making. You can have a modern frontend without throwing away your CMS. You can have AI-powered content management without replacing your admin panel with a chatbot. You can also have no CMS at all and just commit markdown to a repo. The choice is yours. That's the point.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Invert (Astro)                    │
│                  Presentation Layer                  │
│                                                     │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────┐  │
│  │   Renderer   │  │  Router  │  │  Theme/Layout │  │
│  └──────┬──────┘  └────┬─────┘  └───────────────┘  │
│         │              │                            │
│  ┌──────┴──────────────┴──────┐                     │
│  │     Content Normalizer     │                     │
│  │  (common InvertContent     │                     │
│  │   shape from any source)   │                     │
│  └──────────────┬─────────────┘                     │
│                 │                                   │
│  ┌──────────────┴─────────────┐                     │
│  │      Adapter Interface     │                     │
│  └──┬───┬───┬───┬───┬───┬────┘                     │
│     │   │   │   │   │   │                           │
└─────┼───┼───┼───┼───┼───┼───────────────────────────┘
      │   │   │   │   │   │
      ▼   ▼   ▼   ▼   ▼   ▼
   JSON  MD  WP  Drupal CP  MCP
   files git REST JSON:API  Server
              API
```

### Core Concepts

**Content is JSON.** Internally, all content is normalized into a common JSON shape (`InvertContent`). Adapters are responsible for translating their source format into this shape. The renderer doesn't know or care where the content came from.

**Adapters are plugins.** Each content source is an adapter that implements a common interface. Adapters can be local (read JSON files from disk, parse markdown from a directory) or remote (fetch from a WordPress REST API, receive input via MCP). Adapters are registered in configuration and can be composed — you could have markdown files for blog posts and a WordPress backend for pages, simultaneously.

**Content types are just strings.** There is no structural distinction between a "post" and a "page" and a "recipe" and a "case_study." A content type is a string property on the content object. Directory structure can optionally mirror content types (e.g., `content/posts/`, `content/pages/`) but this is convention, not architecture. The system doesn't enforce schemas per content type — that's the adapter's job if it wants to.

**There is no admin.** Content is created and managed externally — in a CMS, in a text editor, in an AI tool, wherever. Invert only reads and renders. This is the core philosophical point: if there's no admin, then the admin can be anything.

**Invert has its own MCP server.** AI tools can query content, list content types, search, and read individual pieces of content through MCP. This completes the loop — an AI can both write content (via a CMS adapter or direct JSON/markdown) and read the rendered result (via MCP).

### Content Shape

The minimum viable content object (`InvertContent`):

```typescript
interface InvertContent {
  // Required
  id: string;              // Unique identifier (adapter-determined)
  slug: string;            // URL-friendly identifier
  title: string;           // Display title
  body: string;            // HTML content (adapters convert markdown, etc.)
  contentType: string;     // e.g., "post", "page", "case_study"

  // Optional
  date?: string;           // ISO 8601 date string
  modified?: string;       // ISO 8601 date string
  author?: string;         // Author name or identifier
  excerpt?: string;        // Short summary
  featuredImage?: string;  // URL or relative path to image
  taxonomies?: Record<string, string[]>; // e.g., { tags: ["ai", "cms"], category: ["tech"] }
  meta?: Record<string, unknown>;        // Arbitrary metadata
}
```

This shape is intentionally minimal. Adapters can pass through additional data in `meta` for templates that need it. The renderer and router only depend on the required fields.

### Adapter Interface

```typescript
interface InvertAdapter {
  // Adapter identity
  name: string;

  // Fetch all content (used at build time for static generation)
  getAll(): Promise<InvertContent[]>;

  // Fetch a single piece of content by slug
  getBySlug(slug: string): Promise<InvertContent | null>;

  // Fetch content filtered by type
  getByType(contentType: string): Promise<InvertContent[]>;

  // Optional: check if adapter supports live/dynamic content
  isDynamic?: boolean;
}
```

### Adapters — Phase 1 (PoC)

#### JSON Adapter
Reads `.json` files from a local directory. Each file is one content item. Directory structure optionally maps to content types.

```
content/
  posts/
    hello-world.json
    second-post.json
  pages/
    about.json
    contact.json
```

Each JSON file conforms to the `InvertContent` shape directly — no transformation needed.

#### MCP Adapter
Exposes an MCP server that allows AI tools to:
- `invert_list` — list all content, optionally filtered by type
- `invert_get` — get a single content item by slug
- `invert_search` — full-text search across content
- `invert_create` — write a new JSON content file to disk
- `invert_update` — update an existing content file
- `invert_delete` — remove a content file

The MCP adapter is bidirectional: it both reads content (for AI tools that want to query the site) and writes content (for AI tools that want to create/edit). Write operations produce JSON files on disk that the JSON adapter then reads at build/render time.

#### Markdown Adapter
Reads `.md` files and parses frontmatter (YAML) into content fields. Body is converted to HTML via a markdown parser (remark/rehype). The source can be local or remote.

**Local source:** Reads from a directory on disk.

**GitHub source:** Fetches markdown files from a GitHub repository via the Contents API. This means Invert can render content from any public (or authenticated private) GitHub repo without cloning it. For large repos, an optional `clone` mode runs `git clone --depth 1` at build time and reads from the local clone instead of making API calls per file.

```typescript
// Local markdown
new MarkdownAdapter({
  source: 'local',
  contentDir: './markdown',
})

// Remote markdown from GitHub (API fetch)
new MarkdownAdapter({
  source: 'github',
  repo: 'pantheon-systems/documentation',
  contentDir: 'source/content',  // subdirectory within repo
  branch: 'main',
  token: process.env.GITHUB_TOKEN, // optional, for private repos / rate limits
})

// Remote markdown from GitHub (clone at build time)
new MarkdownAdapter({
  source: 'github',
  repo: 'pantheon-systems/documentation',
  contentDir: 'source/content',
  branch: 'main',
  mode: 'clone', // git clone --depth 1 into a temp dir during build
})
```

Frontmatter example:

```markdown
---
title: Hello World
date: 2026-04-06
contentType: post
author: Chris
tags: [ai, cms]
---

This is the body content in markdown.
```

A git webhook listener triggers a rebuild when markdown files are pushed to the repository. For GitHub sources, this means the same repo that holds the content can trigger Invert to rebuild via a push webhook — content authors push markdown, the site updates.

### Adapters — Phase 2 (Follow-on)

- **WordPress REST API Adapter**: Fetches posts/pages/CPTs from a WordPress site via REST API. Maps WP response fields to `InvertContent`.
- **Drupal JSON:API Adapter**: Fetches content entities from Drupal via JSON:API. Maps Drupal's entity structure to `InvertContent`.
- **Content Publisher Adapter**: Connects to Pantheon Content Publisher for Google Docs-based content workflows.
- **RSS/Atom Adapter**: Reads feed entries as content items.
- **Generic HTTP Adapter**: Configurable adapter that fetches JSON from any URL and maps fields via a user-defined transform function.

### File Structure

```
invert/
├── astro.config.mjs
├── package.json
├── CLAUDE.md                    # Claude Code project conventions
├── src/
│   ├── adapters/
│   │   ├── interface.ts         # InvertAdapter interface + InvertContent type
│   │   ├── json.ts              # JSON file adapter
│   │   ├── markdown.ts          # Markdown/frontmatter adapter
│   │   └── mcp.ts               # MCP server adapter (read + write)
│   ├── content/                 # Default content directory (JSON/MD files)
│   │   └── posts/
│   │       └── hello-world.json # Example content
│   ├── layouts/
│   │   └── Base.astro           # Base HTML layout
│   ├── pages/
│   │   ├── index.astro          # Homepage (lists recent content)
│   │   ├── [type]/
│   │   │   ├── index.astro      # Content type listing
│   │   │   └── [slug].astro     # Individual content page
│   │   └── 404.astro            # Not found
│   ├── components/
│   │   ├── ContentCard.astro    # Content listing card
│   │   └── ContentBody.astro    # Content body renderer
│   └── lib/
│       ├── config.ts            # Adapter registration + site config
│       └── content.ts           # Content normalizer / query helpers
├── mcp/
│   ├── server.ts                # MCP server entry point
│   └── tools.ts                 # MCP tool definitions
├── webhooks/
│   └── rebuild.ts               # Webhook listener for git push triggers
└── content/                     # Default content directory
    └── posts/
        └── hello-world.json
```

### Configuration

```typescript
// src/lib/config.ts
import { JsonAdapter } from '../adapters/json';
import { MarkdownAdapter } from '../adapters/markdown';

export const invertConfig = {
  siteName: 'My Invert Site',
  siteUrl: 'https://example.com',

  // Register one or more adapters
  // Multiple adapters can run simultaneously —
  // content is merged from all sources
  adapters: [
    new JsonAdapter({ contentDir: './content' }),
    new MarkdownAdapter({ source: 'local', contentDir: './markdown' }),

    // Or pull markdown from a GitHub repo:
    // new MarkdownAdapter({
    //   source: 'github',
    //   repo: 'pantheon-systems/documentation',
    //   contentDir: 'source/content',
    //   branch: 'main',
    // }),
  ],
};
```

### Routing

Astro dynamic routes handle content rendering:

- `/` — Homepage, shows recent content from all adapters
- `/[type]/` — Lists all content of a given type (e.g., `/posts/`, `/pages/`)
- `/[type]/[slug]` — Individual content item (e.g., `/posts/hello-world`)

Routes query all registered adapters and merge results. If two adapters return content with the same slug and type, the first adapter in the config array wins (configurable).

### MCP Server

The MCP server runs as a separate process alongside the Astro dev server (or as a standalone service in production). It provides tools for AI interaction:

**Read tools:**
- `invert_list` — List content with optional type filter and pagination
- `invert_get` — Get a single content item by type and slug
- `invert_search` — Search content by query string (searches title, body, excerpt)
- `invert_types` — List all available content types

**Write tools:**
- `invert_create` — Create a new content item (writes JSON file to disk)
- `invert_update` — Update an existing content item
- `invert_delete` — Delete a content item

Write operations go to disk as JSON files. A file watcher or manual rebuild picks up changes. This means an AI tool connected via MCP can create content, and that content appears on the site after the next build — or immediately if running in dev mode with hot reload.

### Webhook Listener

A minimal HTTP endpoint that listens for git push webhooks (GitHub, GitLab, Bitbucket) and triggers a site rebuild. Configuration:

```typescript
// webhooks/rebuild.ts
export const webhookConfig = {
  secret: process.env.WEBHOOK_SECRET,
  rebuildCommand: 'npm run build',
  branch: 'main', // Only rebuild on pushes to this branch
};
```

For the PoC, this can be a simple Express or Hono endpoint. In production on Cloudflare Pages, this is handled natively by the platform's git integration.

### Media / Images

Images and files are stored alongside content in a `public/media/` directory (or equivalent). Content references images by relative path or URL.

```json
{
  "title": "My Post",
  "featuredImage": "/media/posts/my-post/hero.jpg",
  "body": "<p>Here's an image: <img src=\"/media/posts/my-post/diagram.png\" /></p>"
}
```

For remote adapters (WordPress, Drupal), images remain on the source server and are referenced by absolute URL. No image proxying or downloading unless explicitly configured.

For the PoC on Cloudflare Pages, `public/` is served as static assets. No additional storage configuration needed.

### Deployment — PoC

Cloudflare Pages with the Astro Cloudflare adapter. Free tier. Git-based deployment from GitHub.

The MCP server runs locally during development. For production, the MCP read tools can be exposed as Cloudflare Workers endpoints (future work). Write tools only operate locally or in a CI/CD context — Invert doesn't accept write operations in production (content flows one way: source → build → serve).

### Setup — How a User Creates a Site with Invert

The GitHub repository is configured as a **template repo**. A user creates a new site in under 5 minutes:

1. Go to `github.com/jazzsequence/invert`
2. Click **"Use this template"** → **"Create a new repository"**
3. Name your repo, clone it locally
4. `npm install`
5. Edit `src/lib/config.ts` — set your site name and configure adapters
6. Add content:
   - Drop JSON files into `content/posts/` or `content/pages/`
   - Or drop markdown files into `markdown/`
   - Or point the markdown adapter at a GitHub repo in config
7. `npm run dev` — site is running at `localhost:4321`
8. Optionally: `npm run mcp` in a second terminal to start the MCP server, then connect Claude Desktop or another AI tool
9. Push to GitHub, connect to Cloudflare Pages (or Netlify, or whatever), site is live

**What the user gets out of the box:**

- A working Astro site with dynamic routing by content type and slug
- JSON and markdown adapters pre-configured
- An MCP server they can start with one command
- Example content demonstrating the content shape
- A base layout and minimal components (unstyled — bring your own CSS)
- Cloudflare Pages deployment config

**What the user customizes:**

- `src/lib/config.ts` — site name, URL, which adapters to use and how they're configured
- `src/layouts/Base.astro` — HTML structure, navigation, footer, styles
- `src/components/` — how content cards and content bodies render
- `content/` and/or `markdown/` — their actual content
- Optionally: add Phase 2 adapters (WordPress, Drupal, etc.) as they become available

**Keeping up with upstream changes:**

Template repos don't sync automatically. If Invert ships updates (new adapters, bug fixes, MCP improvements), users would need to manually pull changes. This is an acceptable tradeoff for the PoC. A future CLI scaffolder or npm package model would handle updates more cleanly.

### Future Considerations (Not PoC Scope)

- **CLI scaffolder** (`npm create invert@latest`): Guided setup that asks site name, adapter preferences, deploy target, and generates a configured project. Becomes worth building when people are actually using the template repo.
- **npm package model**: Invert as an installable Astro integration rather than a template. Users add it to their existing Astro project. Most composable, least turnkey.
- **Live preview**: Astro server mode with adapters that fetch on request rather than at build time
- **Incremental builds**: Only rebuild pages whose source content changed
- **Multi-adapter conflict resolution**: Configurable merge strategies when multiple adapters provide content with overlapping slugs
- **Theme system**: Swappable layout/component packages
- **Content validation**: Optional Zod schemas per content type for adapters that want enforcement
- **Pantheon deployment**: Astro on Pantheon's Node.js container infrastructure (pending testing)

---

## Getting Started (Claude Code Init Sequence)

When starting a new Claude Code session to build Invert from scratch:

1. Initialize the Astro project: `npm create astro@latest invert -- --template minimal --typescript strict`
2. Install the Cloudflare adapter: `npx astro add cloudflare`
3. Define the `InvertContent` interface and `InvertAdapter` interface in `src/adapters/interface.ts`
4. Implement the JSON adapter in `src/adapters/json.ts`
5. Create the content normalizer and query helpers in `src/lib/content.ts`
6. Create the adapter config and registration in `src/lib/config.ts`
7. Set up dynamic routing in `src/pages/[type]/[slug].astro` and `src/pages/[type]/index.astro`
8. Create a minimal base layout in `src/layouts/Base.astro` and content rendering components
9. Add example content:
   - `content/posts/hello-world.json`
   - `content/posts/second-post.json`
   - `content/pages/about.json`
10. Verify the site builds and renders: `npm run dev` should show a working site with example content
11. Implement the MCP server in `mcp/server.ts` with read tools (`invert_list`, `invert_get`, `invert_search`, `invert_types`)
12. Add MCP write tools (`invert_create`, `invert_update`, `invert_delete`) that create/update/remove JSON files on disk
13. Add an `npm run mcp` script to `package.json`
14. Implement the markdown adapter in `src/adapters/markdown.ts` with local source support
15. Add GitHub remote source support to the markdown adapter
16. Add the webhook listener scaffold in `webhooks/rebuild.ts`
17. Configure the repo as a GitHub template (Settings → check "Template repository")
18. Set up Cloudflare Pages deployment via GitHub for the reference instance
19. Write README.md with:
    - Project philosophy (the "What This Is" section from the architecture doc)
    - Setup instructions (the template repo flow)
    - Content shape reference
    - Adapter documentation
    - MCP tool reference
    - How to add content
    - How to deploy

**Priority order:** Get a working site with the JSON adapter and example content first (steps 1–10). Then MCP (steps 11–13). Then markdown (steps 14–16). Then deployment and docs (steps 17–19). Everything should work locally before worrying about deployment.