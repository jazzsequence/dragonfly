---
title: Getting Started
slug: getting-started
contentType: docs
date: 2026-04-06
excerpt: How to create a new site using Invert as a GitHub template.
---

# Getting Started

Invert is distributed as a GitHub template repository. You create a new repo from the template, clone it, and you have a working site in under 5 minutes.

## Create your site

1. Go to [github.com/jazzsequence/invert](https://github.com/jazzsequence/invert)
2. Click **Use this template** → **Create a new repository**
3. Name your repo and clone it locally
4. Run `npm install`

## Configure

Edit `src/lib/config.ts` to set your site name, URL, and which adapters to use:

```typescript
export const invertConfig = {
  siteName: 'My Site',
  siteUrl: 'https://example.com',
  adapters: [
    new JsonAdapter({ contentDir: join(root, 'content') }),
    new MarkdownAdapter({ source: 'local', contentDir: join(root, 'markdown') }),
  ],
};
```

## Add content

**JSON content** — drop files into `content/[type]/[slug].json`:

```json
{
  "id": "my-post",
  "slug": "my-post",
  "title": "My First Post",
  "contentType": "posts",
  "body": "<p>Hello world.</p>",
  "date": "2026-04-06"
}
```

**Markdown content** — drop `.md` files into `markdown/` with frontmatter:

```markdown
---
title: My Post
contentType: posts
date: 2026-04-06
---

Hello world.
```

## Run the dev server

```bash
npm run dev
```

Your site is running at `http://localhost:4321`. Content is served at `/{type}/{slug}` — e.g., `/posts/my-post`.

## MCP server (optional)

In a second terminal:

```bash
npm run mcp
```

This starts the MCP server on stdio. Connect it to Claude Desktop or any MCP-compatible AI tool. The server provides read tools (`invert_list`, `invert_get`, `invert_search`, `invert_types`) and write tools (`invert_create`, `invert_update`, `invert_delete`) that operate on your `content/` directory.

## Deploy

**GitHub Pages** — the included workflow in `.github/workflows/deploy-docs.yml` builds and deploys on push to `main`. Enable GitHub Pages in your repo settings (Settings → Pages → Source: GitHub Actions).

**Cloudflare Pages** — connect your repo in the Cloudflare Pages dashboard. Build command: `npm run build`. Output directory: `dist`.

**Any static host** — run `npm run build` and deploy the `dist/` directory.
