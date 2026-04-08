import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import type { InvertAdapter, InvertContent } from './interface.ts';

export interface JsonAdapterOptions {
  contentDir: string;
}

export class JsonAdapter implements InvertAdapter {
  name = 'json';
  private contentDir: string;

  constructor({ contentDir }: JsonAdapterOptions) {
    this.contentDir = contentDir;
  }

  async getAll(): Promise<InvertContent[]> {
    const results: InvertContent[] = [];
    let typeDirs: string[];

    try {
      typeDirs = await readdir(this.contentDir);
    } catch {
      return results;
    }

    for (const typeDir of typeDirs) {
      const typePath = join(this.contentDir, typeDir);
      let files: string[];

      try {
        files = await readdir(typePath);
      } catch {
        continue;
      }

      for (const file of files) {
        if (extname(file) !== '.json') continue;
        const content = await this.readJsonFile(join(typePath, file), typeDir);
        if (content) results.push(content);
      }
    }

    return results;
  }

  async getBySlug(slug: string): Promise<InvertContent | null> {
    const all = await this.getAll();
    return all.find((c) => c.slug === slug) ?? null;
  }

  async getByType(contentType: string): Promise<InvertContent[]> {
    const typePath = join(this.contentDir, contentType);
    const results: InvertContent[] = [];
    let files: string[];

    try {
      files = await readdir(typePath);
    } catch {
      return results;
    }

    for (const file of files) {
      if (extname(file) !== '.json') continue;
      const content = await this.readJsonFile(join(typePath, file), contentType);
      if (content) results.push(content);
    }

    return results;
  }

  private async readJsonFile(
    filePath: string,
    defaultType: string
  ): Promise<InvertContent | null> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as Partial<InvertContent>;
      const slug = data.slug ?? basename(filePath, '.json');

      return {
        id: data.id ?? slug,
        slug,
        title: data.title ?? slug,
        body: data.body ?? '',
        contentType: data.contentType ?? defaultType,
        date: data.date,
        modified: data.modified,
        author: data.author,
        excerpt: data.excerpt,
        featuredImage: data.featuredImage,
        taxonomies: data.taxonomies,
        meta: data.meta,
      };
    } catch {
      return null;
    }
  }
}
