import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  invertList,
  invertGet,
  invertSearch,
  invertTypes,
  invertCreate,
  invertUpdate,
  invertDelete,
  invertPublish,
  invertNormalizeAndCreate,
  type SourceType,
} from './tools.ts';

const server = new McpServer({
  name: 'invert',
  version: '0.1.0',
});

// Read tools

server.tool(
  'invert_list',
  'List content items, optionally filtered by type.',
  {
    contentType: z.string().optional().describe('Filter by content type (e.g. "posts", "pages")'),
    limit: z.number().optional().default(20).describe('Maximum number of results'),
    offset: z.number().optional().default(0).describe('Pagination offset'),
  },
  async ({ contentType, limit, offset }) => {
    const items = await invertList(contentType, limit, offset);
    return {
      content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
    };
  }
);

server.tool(
  'invert_get',
  'Get a single content item by type and slug.',
  {
    contentType: z.string().describe('Content type (e.g. "posts")'),
    slug: z.string().describe('Content slug (e.g. "hello-world")'),
  },
  async ({ contentType, slug }) => {
    const item = await invertGet(contentType, slug);
    if (!item) {
      return {
        content: [{ type: 'text', text: `Not found: ${contentType}/${slug}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(item, null, 2) }],
    };
  }
);

server.tool(
  'invert_search',
  'Full-text search across all content (title, body, excerpt).',
  {
    query: z.string().describe('Search query'),
  },
  async ({ query }) => {
    const results = await invertSearch(query);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.tool(
  'invert_types',
  'List all available content types.',
  {},
  async () => {
    const types = await invertTypes();
    return {
      content: [{ type: 'text', text: JSON.stringify(types) }],
    };
  }
);

// Write tools

server.tool(
  'invert_create',
  'Create a new content item. Set status to "draft" to write to .drafts/ (gitignored, never deployed); omit or set to "published" to write to content/ (committed and deployed).',
  {
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    body: z.string(),
    contentType: z.string(),
    status: z.enum(['draft', 'published']).optional().describe('"draft" stores in .drafts/ (transient, not committed); "published" stores in content/ (committed and deployed)'),
    date: z.string().optional(),
    author: z.string().optional(),
    excerpt: z.string().optional(),
    featuredImage: z.string().optional(),
    taxonomies: z.record(z.array(z.string())).optional(),
    meta: z.record(z.unknown()).optional(),
  },
  async (content) => {
    const result = await invertCreate(content);
    return {
      content: [{ type: 'text', text: `Created: ${result.path}` }],
    };
  }
);

server.tool(
  'invert_update',
  'Update an existing content item. Changing status between "draft" and "published" moves the file between .drafts/ and content/.',
  {
    contentType: z.string(),
    slug: z.string(),
    updates: z.object({
      title: z.string().optional(),
      body: z.string().optional(),
      status: z.enum(['draft', 'published']).optional().describe('Change status to move the file between .drafts/ and content/'),
      date: z.string().optional(),
      author: z.string().optional(),
      excerpt: z.string().optional(),
      featuredImage: z.string().optional(),
      taxonomies: z.record(z.array(z.string())).optional(),
      meta: z.record(z.unknown()).optional(),
    }),
  },
  async ({ contentType, slug, updates }) => {
    const updated = await invertUpdate(contentType, slug, updates);
    if (!updated) {
      return {
        content: [{ type: 'text', text: `Not found: ${contentType}/${slug}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
    };
  }
);

server.tool(
  'invert_delete',
  'Delete a content item.',
  {
    contentType: z.string(),
    slug: z.string(),
  },
  async ({ contentType, slug }) => {
    const result = await invertDelete(contentType, slug);
    return {
      content: [
        {
          type: 'text',
          text: result.deleted
            ? `Deleted: ${contentType}/${slug}`
            : `Not found: ${contentType}/${slug}`,
        },
      ],
    };
  }
);

server.tool(
  'invert_publish',
  'Promote a draft to published: moves it from .drafts/ to content/ and sets status to "published". The file will be picked up by git on the next commit.',
  {
    contentType: z.string().describe('Content type (e.g. "posts")'),
    slug: z.string().describe('Content slug (e.g. "my-draft-post")'),
  },
  async ({ contentType, slug }) => {
    const result = await invertPublish(contentType, slug);
    if (!result) {
      return {
        content: [{ type: 'text', text: `Draft not found: ${contentType}/${slug}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: `Published: ${result.path}` }],
    };
  }
);

server.tool(
  'invert_normalize_and_create',
  'Normalize raw content returned by a WordPress or Drupal source MCP and import it as Invert content. The AI fetches from the source MCP, then passes the raw result here — field mapping is handled in code, not in the AI reasoning chain.',
  {
    raw: z.record(z.unknown()).describe('Raw content object returned by the source MCP'),
    sourceType: z
      .enum(['wordpress', 'drupal'])
      .describe('Source platform type — determines the normalization mapping'),
    contentType: z
      .string()
      .optional()
      .describe('Override the content type derived from the source (e.g. map WP "post" to "article")'),
  },
  async ({ raw, sourceType, contentType }) => {
    const result = await invertNormalizeAndCreate(raw, sourceType as SourceType, contentType);
    return {
      content: [{ type: 'text', text: `Imported: ${result.path}` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
