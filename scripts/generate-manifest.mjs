/**
 * generate-manifest.mjs
 *
 * Run after `astro build`. Reads all content sources and writes
 * dist/_api/content.json — a flat manifest of every content item.
 *
 * This file is served as a static asset and fetched by the MCP Pages
 * Function at runtime via the ASSETS binding, so the function can list
 * and search content without filesystem access.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const root = process.cwd();
const out = join(root, 'dist', '_api');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse YAML-style frontmatter from a markdown string. */
function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { meta: {}, body: source };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, '');
    meta[key] = value;
  }
  const body = source.slice(match[0].length).trim();
  return { meta, body };
}

/** Slugify a filename (strip extension, lowercase). */
function slugFromFile(file) {
  return basename(file, extname(file)).toLowerCase();
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

async function readJsonDir(dir, contentType) {
  const items = [];
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return items;
  }
  for (const file of files) {
    if (extname(file) !== '.json') continue;
    try {
      const raw = await readFile(join(dir, file), 'utf-8');
      const data = JSON.parse(raw);
      items.push({ contentType, ...data });
    } catch {
      // skip malformed
    }
  }
  return items;
}

async function readMarkdownDir(dir, defaultContentType) {
  const items = [];
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return items;
  }
  for (const file of files) {
    if (extname(file) !== '.md') continue;
    try {
      const raw = await readFile(join(dir, file), 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const slug = meta.slug ?? slugFromFile(file);
      const contentType = meta.contentType ?? defaultContentType;
      items.push({
        id: slug,
        slug,
        title: meta.title ?? slug,
        contentType,
        date: meta.date ?? null,
        excerpt: meta.excerpt ?? null,
        author: meta.author ?? null,
        body,
      });
    } catch {
      // skip malformed
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const items = [];

  // JSON content (content/[type]/*.json)
  let contentDirs;
  try {
    contentDirs = await readdir(join(root, 'content'));
  } catch {
    contentDirs = [];
  }
  for (const typeDir of contentDirs) {
    const dirItems = await readJsonDir(join(root, 'content', typeDir), typeDir);
    items.push(...dirItems);
  }

  // Markdown content (markdown/*.md)
  const mdItems = await readMarkdownDir(join(root, 'markdown'), 'pages');
  items.push(...mdItems);

  // Docs (docs/*.md)
  const docsItems = await readMarkdownDir(join(root, 'docs'), 'docs');
  items.push(...docsItems);

  // Write manifest
  await mkdir(out, { recursive: true });
  await writeFile(
    join(out, 'content.json'),
    JSON.stringify({ items, generatedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  );

  console.log(`[manifest] wrote ${items.length} items → dist/_api/content.json`);
}

main().catch((err) => {
  console.error('[manifest] error:', err);
  process.exit(1);
});
