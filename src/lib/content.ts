import type { InvertContent } from '../adapters/interface.ts';
import { invertConfig } from './config.ts';

export interface ContentQueryOptions {
  /** Include content with status: "draft". Defaults to false. */
  includeDrafts?: boolean;
}

export async function getAllContent(options: ContentQueryOptions = {}): Promise<InvertContent[]> {
  const results = await Promise.all(
    invertConfig.adapters.map((adapter) => adapter.getAll())
  );

  const seen = new Set<string>();
  const merged: InvertContent[] = [];

  for (const batch of results) {
    for (const item of batch) {
      const key = `${item.contentType}::${item.slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
  }

  const sorted = merged.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    return 0;
  });

  // undefined status is treated as published — backwards compatible
  return options.includeDrafts ? sorted : sorted.filter((item) => item.status !== 'draft');
}

export async function getContentByType(contentType: string): Promise<InvertContent[]> {
  const all = await getAllContent();
  return all.filter((c) => c.contentType === contentType);
}

export async function getContentBySlug(
  contentType: string,
  slug: string
): Promise<InvertContent | null> {
  const all = await getAllContent();
  return all.find((c) => c.contentType === contentType && c.slug === slug) ?? null;
}

export async function getContentTypes(): Promise<string[]> {
  const all = await getAllContent();
  return [...new Set(all.map((c) => c.contentType))];
}

export async function searchContent(query: string): Promise<InvertContent[]> {
  const all = await getAllContent();
  const q = query.toLowerCase();
  return all.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.body.toLowerCase().includes(q) ||
      (c.excerpt?.toLowerCase().includes(q) ?? false)
  );
}
