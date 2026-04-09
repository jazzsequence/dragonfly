import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { InvertContent } from '../src/adapters/interface.ts';

// MCP write tools intentionally target content/ only — the JSON adapter's write path.
// This is by design: Invert treats markdown files (markdown/, docs/) as externally
// managed source files, not AI-writable content. If you want AI tools to write
// markdown, point them at your source repo directly. The MCP server's job is to
// create and mutate structured content items, which the JSON adapter owns.
const CONTENT_DIR = './content';

/** List content items, optionally scoped to a single type. Paginated via limit/offset. */
export async function invertList(
  contentType?: string,
  limit = 20,
  offset = 0
): Promise<InvertContent[]> {
  const all: InvertContent[] = [];
  const typeDirs = contentType ? [contentType] : await readdir(CONTENT_DIR).catch(() => []);

  for (const typeDir of typeDirs) {
    const typePath = join(CONTENT_DIR, typeDir);
    const files = await readdir(typePath).catch(() => []);

    for (const file of files) {
      if (extname(file) !== '.json') continue;
      try {
        const raw = await readFile(join(typePath, file), 'utf-8');
        const data = JSON.parse(raw) as InvertContent;
        all.push(data);
      } catch {
        // skip malformed files
      }
    }
  }

  return all.slice(offset, offset + limit);
}

/** Get a single content item by type and slug. Returns null if not found. */
export async function invertGet(
  contentType: string,
  slug: string
): Promise<InvertContent | null> {
  try {
    const filePath = join(CONTENT_DIR, contentType, `${slug}.json`);
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as InvertContent;
  } catch {
    return null;
  }
}

/** Full-text search across title, body, and excerpt of all content. */
export async function invertSearch(query: string): Promise<InvertContent[]> {
  const all = await invertList(undefined, 1000);
  const q = query.toLowerCase();
  return all.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.body.toLowerCase().includes(q) ||
      (c.excerpt?.toLowerCase().includes(q) ?? false)
  );
}

/** List all content type directories present under content/. */
export async function invertTypes(): Promise<string[]> {
  return readdir(CONTENT_DIR).catch(() => []);
}

/** Write a content item to disk as content/[type]/[slug].json. Creates the type dir if needed. */
export async function invertCreate(content: InvertContent): Promise<{ path: string }> {
  const { mkdir } = await import('node:fs/promises');
  const dir = join(CONTENT_DIR, content.contentType);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${content.slug}.json`);
  await writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
  return { path: filePath };
}

/** Merge updates into an existing content item and write it back. Returns null if not found. */
export async function invertUpdate(
  contentType: string,
  slug: string,
  updates: Partial<InvertContent>
): Promise<InvertContent | null> {
  const existing = await invertGet(contentType, slug);
  if (!existing) return null;

  const updated: InvertContent = { ...existing, ...updates };
  const filePath = join(CONTENT_DIR, contentType, `${slug}.json`);
  await writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

/** Delete a content item from disk. Returns whether the file existed. */
export async function invertDelete(
  contentType: string,
  slug: string
): Promise<{ deleted: boolean }> {
  try {
    const filePath = join(CONTENT_DIR, contentType, `${slug}.json`);
    await unlink(filePath);
    return { deleted: true };
  } catch {
    return { deleted: false };
  }
}

// ---------------------------------------------------------------------------
// Source normalization
//
// When Claude is connected to both a source MCP (WordPress, Drupal) and the
// Invert MCP, the AI fetches raw content via the source MCP and passes it
// here. Normalization logic lives in code rather than in the AI's reasoning
// chain so mappings are deterministic and consistent across imports.
// ---------------------------------------------------------------------------

type WPPost = {
  id: number;
  slug: string;
  type: string;
  date?: string;
  modified?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
  // present when fetched with ?_embed
  _embedded?: {
    author?: Array<{ name?: string }>;
    'wp:featuredmedia'?: Array<{ source_url?: string }>;
    'wp:term'?: Array<Array<{ slug?: string }>>;
  };
};

type DrupalNode = {
  data?: {
    type?: string;  // e.g. "node--article"
    id?: string;    // UUID
    attributes?: {
      drupal_internal__nid?: number;
      title?: string;
      body?: { value?: string; processed?: string; summary?: string };
      path?: { alias?: string };
      created?: string;
      changed?: string;
      field_summary?: string;
    };
  };
};

/** Map a WordPress REST API post object (fetch with ?_embed for full data) to InvertContent. */
function normalizeWordPress(raw: Record<string, unknown>, contentTypeOverride?: string): InvertContent {
  const wp = raw as WPPost;
  const embedded = wp._embedded;
  const categories = (embedded?.['wp:term']?.[0] ?? [])
    .map((t) => t.slug)
    .filter((s): s is string => Boolean(s));
  const tags = (embedded?.['wp:term']?.[1] ?? [])
    .map((t) => t.slug)
    .filter((s): s is string => Boolean(s));

  return {
    id: String(wp.id),
    slug: wp.slug,
    title: wp.title?.rendered ?? wp.slug,
    body: wp.content?.rendered ?? '',
    contentType: contentTypeOverride ?? wp.type ?? 'post',
    date: wp.date,
    modified: wp.modified,
    author: embedded?.author?.[0]?.name,
    excerpt: wp.excerpt?.rendered,
    featuredImage: embedded?.['wp:featuredmedia']?.[0]?.source_url,
    ...(categories.length || tags.length
      ? { taxonomies: { ...(categories.length && { categories }), ...(tags.length && { tags }) } }
      : {}),
    meta: {
      sourceUrl: wp.link,
      wpId: wp.id,
    },
  };
}

/** Map a Drupal JSON:API node resource object to InvertContent. */
function normalizeDrupal(raw: Record<string, unknown>, contentTypeOverride?: string): InvertContent {
  const node = raw as DrupalNode;
  const attrs = node.data?.attributes;

  // "node--article" → "article"
  const rawType = node.data?.type ?? '';
  const derivedType = rawType.startsWith('node--') ? rawType.slice(6) : rawType;

  // path alias ("/my-post") → slug ("my-post"), fallback to nid or uuid
  const rawAlias = attrs?.path?.alias ?? '';
  const slug = rawAlias.startsWith('/')
    ? rawAlias.slice(1)
    : rawAlias || String(attrs?.drupal_internal__nid ?? node.data?.id ?? '');

  return {
    id: node.data?.id ?? slug,
    slug,
    title: attrs?.title ?? slug,
    body: attrs?.body?.processed ?? attrs?.body?.value ?? '',
    contentType: contentTypeOverride ?? derivedType || 'article',
    date: attrs?.created,
    modified: attrs?.changed,
    excerpt: attrs?.field_summary ?? attrs?.body?.summary,
    meta: {
      drupalId: node.data?.id,
      drupalNid: attrs?.drupal_internal__nid,
    },
  };
}

const normalizers = {
  wordpress: normalizeWordPress,
  drupal: normalizeDrupal,
} as const;

export type SourceType = keyof typeof normalizers;

/**
 * Normalize raw content from a source MCP and write it to disk as Invert content.
 *
 * Usage pattern: AI fetches content via source MCP → passes raw result here →
 * this function owns the field mapping so it doesn't live in the AI's reasoning.
 * Calls invertCreate internally, so re-importing the same slug overwrites in place.
 */
export async function invertNormalizeAndCreate(
  raw: Record<string, unknown>,
  sourceType: SourceType,
  contentType?: string
): Promise<{ path: string }> {
  const normalized = normalizers[sourceType](raw, contentType);
  return invertCreate(normalized);
}
