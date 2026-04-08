---
title: Adapters
slug: adapters
contentType: docs
date: 2026-04-06
excerpt: How the adapter system works, the built-in adapters, and how to build your own.
---

# Adapters

Adapters are the integration point between Invert and your content sources. Each adapter implements the `InvertAdapter` interface and is responsible for fetching and transforming content into the normalized `InvertContent` shape.

## The interface

```typescript
interface InvertAdapter {
  name: string;
  getAll(): Promise<InvertContent[]>;
  getBySlug(slug: string): Promise<InvertContent | null>;
  getByType(contentType: string): Promise<InvertContent[]>;
  isDynamic?: boolean;
}
```

All adapters must implement `getAll`, `getBySlug`, and `getByType`. The optional `isDynamic` flag is reserved for future use with live/on-request content.

## Registering adapters

Adapters are registered in `src/lib/config.ts`. Multiple adapters run simultaneously — content merges from all sources. If two adapters return content with the same `contentType` and `slug`, the first adapter in the array wins.

```typescript
export const invertConfig = {
  adapters: [
    new JsonAdapter({ contentDir: join(root, 'content') }),
    new MarkdownAdapter({ source: 'local', contentDir: join(root, 'markdown') }),
  ],
};
```

## Built-in adapters

### JsonAdapter

Reads `.json` files from a local directory. Each file is one content item. Directory structure maps to content types:

```
content/
  posts/
    my-post.json       → contentType: "posts", slug: "my-post"
  pages/
    about.json         → contentType: "pages", slug: "about"
```

Each JSON file conforms directly to the `InvertContent` shape. Fields not present in the file are inferred from the directory structure and filename.

```typescript
new JsonAdapter({ contentDir: join(root, 'content') })
```

### MarkdownAdapter

Reads `.md` files and parses YAML frontmatter into content fields. The body is converted from Markdown to HTML via remark.

**Local source:**

```typescript
new MarkdownAdapter({ source: 'local', contentDir: join(root, 'markdown') })
```

**GitHub source** — fetches markdown files from a GitHub repository via the Contents API:

```typescript
new MarkdownAdapter({
  source: 'github',
  repo: 'owner/repo',
  contentDir: 'content/posts',
  branch: 'main',
  token: process.env.GITHUB_TOKEN,
})
```

Frontmatter example:

```markdown
---
title: My Post
slug: my-post
contentType: posts
date: 2026-04-06
author: Chris
tags: [astro, invert]
---

Body content here.
```

### DocsAdapter

A purpose-built adapter for documentation directories. Forces `contentType: "docs"` on all content regardless of frontmatter, and falls back to extracting the first `<h1>` from the body as a title. Included as a worked example of building a custom adapter.

```typescript
new DocsAdapter({ contentDir: join(root, 'docs') })
```

See `src/adapters/docs.ts` for the full annotated implementation.

## Building a custom adapter

Copy `src/adapters/docs.ts` as a starting point. The minimum viable adapter:

```typescript
import type { InvertAdapter, InvertContent } from './interface.ts';

export class MyAdapter implements InvertAdapter {
  name = 'my-adapter';

  async getAll(): Promise<InvertContent[]> {
    // fetch your content, return InvertContent[]
    return [];
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
