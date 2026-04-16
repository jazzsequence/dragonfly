import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { InvertContent } from '../src/adapters/interface.ts';

// MCP write tools intentionally target content/ only — the JSON adapter's write path.
// This is by design: Invert treats markdown files (markdown/, docs/) as externally
// managed source files, not AI-writable content. If you want AI tools to write
// markdown, point them at your source repo directly. The MCP server's job is to
// create and mutate structured content items, which the JSON adapter owns.
const CONTENT_DIR = './content';

// Draft content lives here — gitignored and never deployed to Cloudflare Pages.
// Drafts are transient: they exist locally for preview purposes only.
// Use invert_publish to promote a draft into content/ (and into git).
const DRAFTS_DIR = './.drafts';

function contentDirForStatus(status?: 'draft' | 'published'): string {
  return status === 'draft' ? DRAFTS_DIR : CONTENT_DIR;
}

/** Read all JSON files from a directory tree, scoped to an optional content type. */
async function readDir(
  baseDir: string,
  contentType?: string
): Promise<InvertContent[]> {
  const all: InvertContent[] = [];
  const typeDirs = contentType
    ? [contentType]
    : await readdir(baseDir).catch(() => []);

  for (const typeDir of typeDirs) {
    const typePath = join(baseDir, typeDir);
    const files = await readdir(typePath).catch(() => []);

    for (const file of files) {
      if (extname(file) !== '.json') continue;
      try {
        const raw = await readFile(join(typePath, file), 'utf-8');
        all.push(JSON.parse(raw) as InvertContent);
      } catch {
        // skip malformed files
      }
    }
  }

  return all;
}

/** Find a content item by type and slug, checking content/ then .drafts/. Returns the item and which dir it lives in. */
async function findContent(
  contentType: string,
  slug: string
): Promise<{ content: InvertContent; dir: string } | null> {
  for (const dir of [CONTENT_DIR, DRAFTS_DIR]) {
    try {
      const filePath = join(dir, contentType, `${slug}.json`);
      const raw = await readFile(filePath, 'utf-8');
      return { content: JSON.parse(raw) as InvertContent, dir };
    } catch {
      // not in this dir, try next
    }
  }
  return null;
}

/** List content items, optionally scoped to a single type. Paginated via limit/offset. Includes drafts. */
export async function invertList(
  contentType?: string,
  limit = 20,
  offset = 0
): Promise<InvertContent[]> {
  const [published, drafts] = await Promise.all([
    readDir(CONTENT_DIR, contentType),
    readDir(DRAFTS_DIR, contentType),
  ]);

  // Deduplicate: published wins if the same slug somehow exists in both
  const seen = new Set<string>();
  const merged: InvertContent[] = [];
  for (const item of [...published, ...drafts]) {
    const key = `${item.contentType}::${item.slug}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return merged.slice(offset, offset + limit);
}

/** Get a single content item by type and slug. Checks content/ then .drafts/. Returns null if not found. */
export async function invertGet(
  contentType: string,
  slug: string
): Promise<InvertContent | null> {
  const found = await findContent(contentType, slug);
  return found?.content ?? null;
}

/** Full-text search across title, body, and excerpt of all content (including drafts). */
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

/** List all content type directories present under content/ and .drafts/. */
export async function invertTypes(): Promise<string[]> {
  const [published, drafts] = await Promise.all([
    readdir(CONTENT_DIR).catch(() => [] as string[]),
    readdir(DRAFTS_DIR).catch(() => [] as string[]),
  ]);
  return [...new Set([...published, ...drafts])];
}

/** Write a content item to disk. Drafts go to .drafts/[type]/[slug].json; published go to content/. */
export async function invertCreate(content: InvertContent): Promise<{ path: string }> {
  const { mkdir } = await import('node:fs/promises');
  const dir = contentDirForStatus(content.status);
  const typeDir = join(dir, content.contentType);
  await mkdir(typeDir, { recursive: true });
  const filePath = join(typeDir, `${content.slug}.json`);
  await writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
  return { path: filePath };
}

/** Merge updates into an existing content item and write it back. Returns null if not found.
 *  If status changes (draft ↔ published), the file is moved between content/ and .drafts/. */
export async function invertUpdate(
  contentType: string,
  slug: string,
  updates: Partial<InvertContent>
): Promise<InvertContent | null> {
  const found = await findContent(contentType, slug);
  if (!found) return null;

  const updated: InvertContent = { ...found.content, ...updates };
  const newDir = contentDirForStatus(updated.status);
  const newFilePath = join(newDir, contentType, `${slug}.json`);

  if (newDir !== found.dir) {
    // Status changed — move the file
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(newDir, contentType), { recursive: true });
    await writeFile(newFilePath, JSON.stringify(updated, null, 2), 'utf-8');
    await unlink(join(found.dir, contentType, `${slug}.json`));
  } else {
    await writeFile(newFilePath, JSON.stringify(updated, null, 2), 'utf-8');
  }

  return updated;
}

/** Delete a content item from disk. Checks content/ then .drafts/. Returns whether the file existed. */
export async function invertDelete(
  contentType: string,
  slug: string
): Promise<{ deleted: boolean }> {
  const found = await findContent(contentType, slug);
  if (!found) return { deleted: false };

  try {
    await unlink(join(found.dir, contentType, `${slug}.json`));
    return { deleted: true };
  } catch {
    return { deleted: false };
  }
}

/** Promote a draft to published content: moves it from .drafts/ to content/ and sets status to 'published'.
 *  Returns null if the draft does not exist. */
export async function invertPublish(
  contentType: string,
  slug: string
): Promise<{ path: string } | null> {
  let draft: InvertContent;
  try {
    const filePath = join(DRAFTS_DIR, contentType, `${slug}.json`);
    const raw = await readFile(filePath, 'utf-8');
    draft = JSON.parse(raw) as InvertContent;
  } catch {
    return null;
  }

  const published: InvertContent = { ...draft, status: 'published' };
  const { mkdir } = await import('node:fs/promises');
  const destDir = join(CONTENT_DIR, contentType);
  await mkdir(destDir, { recursive: true });
  const destPath = join(destDir, `${slug}.json`);
  await writeFile(destPath, JSON.stringify(published, null, 2), 'utf-8');
  await unlink(join(DRAFTS_DIR, contentType, `${slug}.json`));
  return { path: destPath };
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
    contentType: contentTypeOverride ?? (derivedType || 'article'),
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
