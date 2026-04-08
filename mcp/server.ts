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
  'Create a new content item (writes a JSON file to disk).',
  {
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    body: z.string(),
    contentType: z.string(),
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
  'Update an existing content item.',
  {
    contentType: z.string(),
    slug: z.string(),
    updates: z.object({
      title: z.string().optional(),
      body: z.string().optional(),
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

const transport = new StdioServerTransport();
await server.connect(transport);
