---
title: MCP Server
slug: mcp
contentType: docs
date: 2026-04-06
excerpt: The built-in Model Context Protocol server — read and write content from AI tools.
---

# MCP Server

Invert ships with an MCP (Model Context Protocol) server that exposes your content to AI tools. Start it alongside the dev server:

```bash
npm run mcp
```

The server runs on stdio and is compatible with Claude Desktop and any other MCP client.

## Read tools

### invert_list

List content items, optionally filtered by type.

```
invert_list(contentType?: string, limit?: number, offset?: number)
```

Returns an array of `InvertContent` objects. Use `contentType` to filter by type (e.g. `"posts"`). `limit` defaults to 20, `offset` to 0.

### invert_get

Get a single content item by type and slug.

```
invert_get(contentType: string, slug: string)
```

Returns the matching `InvertContent` object, or an error if not found.

### invert_search

Full-text search across all content (searches `title`, `body`, and `excerpt`).

```
invert_search(query: string)
```

Returns an array of matching `InvertContent` objects.

### invert_types

List all available content types.

```
invert_types()
```

Returns a string array of content type names present in your `content/` directory.

## Write tools

Write tools create, update, and delete JSON files in your `content/` directory. Changes are picked up immediately in dev mode (hot reload) and on the next build in production.

### invert_create

Create a new content item.

```
invert_create(id, slug, title, body, contentType, date?, author?, excerpt?, ...)
```

Writes a new JSON file to `content/{contentType}/{slug}.json`.

### invert_update

Update fields on an existing content item.

```
invert_update(contentType: string, slug: string, updates: Partial<InvertContent>)
```

Merges `updates` into the existing content and rewrites the JSON file.

### invert_delete

Delete a content item.

```
invert_delete(contentType: string, slug: string)
```

Removes `content/{contentType}/{slug}.json` from disk.

## Connecting to Claude Desktop

Add Invert to your Claude Desktop MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "invert": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/your/invert/site"
    }
  }
}
```

Once connected, Claude can list your content, search it, create new posts, and update existing ones — without touching the filesystem directly.

## Production notes

The MCP server is designed for local development use. Write tools modify files on disk, which only makes sense locally or in a CI/CD context. In a deployed static site, content flows one way: source → build → serve. The read tools could be exposed as serverless endpoints in a future release.
