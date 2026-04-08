import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { InvertContent } from '../src/adapters/interface.ts';

// MCP write tools intentionally target content/ only — the JSON adapter's write path.
// This is by design: Invert treats markdown files (markdown/, docs/) as externally
// managed source files, not AI-writable content. If you want AI tools to write
// markdown, point them at your source repo directly. The MCP server's job is to
// create and mutate structured content items, which the JSON adapter owns.
const CONTENT_DIR = './content';

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

export async function invertTypes(): Promise<string[]> {
  return readdir(CONTENT_DIR).catch(() => []);
}

export async function invertCreate(content: InvertContent): Promise<{ path: string }> {
  const { mkdir } = await import('node:fs/promises');
  const dir = join(CONTENT_DIR, content.contentType);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${content.slug}.json`);
  await writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
  return { path: filePath };
}

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
