/**
 * DocsAdapter — example custom adapter
 *
 * This is a worked example of building a custom InvertAdapter. Copy and modify
 * it as a starting point for any content source that doesn't fit the built-in
 * adapters. The only requirement is that you implement the InvertAdapter interface
 * and return valid InvertContent objects.
 *
 * What this adapter does:
 * - Reads markdown files from a local `docs/` directory
 * - Forces contentType to "docs" regardless of frontmatter
 * - Extracts the first <h1> from the body as a fallback title
 * - Everything else delegates to MarkdownAdapter
 */

import { MarkdownAdapter } from './markdown.ts';
import type { InvertAdapter, InvertContent } from './interface.ts';

export interface DocsAdapterOptions {
  /** Absolute path to the docs directory. */
  contentDir: string;
}

export class DocsAdapter implements InvertAdapter {
  name = 'docs';
  private markdown: MarkdownAdapter;

  constructor({ contentDir }: DocsAdapterOptions) {
    this.markdown = new MarkdownAdapter({ source: 'local', contentDir });
  }

  async getAll(): Promise<InvertContent[]> {
    const items = await this.markdown.getAll();
    return items.map(this.normalize);
  }

  async getBySlug(slug: string): Promise<InvertContent | null> {
    const item = await this.markdown.getBySlug(slug);
    return item ? this.normalize(item) : null;
  }

  async getByType(contentType: string): Promise<InvertContent[]> {
    if (contentType !== 'docs') return [];
    return this.getAll();
  }

  private normalize(item: InvertContent): InvertContent {
    return {
      ...item,
      contentType: 'docs',
      // Fall back to extracting the first h1 from the body if title is just the filename.
      title: item.title !== item.slug ? item.title : extractH1(item.body) ?? item.title,
    };
  }
}

function extractH1(html: string): string | null {
  const match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : null;
}
