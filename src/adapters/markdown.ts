import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import type { InvertAdapter, InvertContent } from './interface.ts';

export type MarkdownSource = 'local' | 'github';

export interface MarkdownAdapterOptions {
  source: MarkdownSource;
  contentDir: string;
  repo?: string;
  branch?: string;
  token?: string;
  mode?: 'api' | 'clone';
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const frontmatter: Record<string, unknown> = {};
  const yamlBlock = match[1];
  const body = match[2];

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      frontmatter[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim());
    } else {
      frontmatter[key] = rawValue;
    }
  }

  return { frontmatter, body };
}

async function markdownToHtml(md: string): Promise<string> {
  const result = await remark().use(remarkGfm).use(remarkHtml).process(md);
  return result.toString();
}

export class MarkdownAdapter implements InvertAdapter {
  name = 'markdown';
  private options: MarkdownAdapterOptions;

  constructor(options: MarkdownAdapterOptions) {
    this.options = options;
  }

  async getAll(): Promise<InvertContent[]> {
    if (this.options.source === 'local') {
      return this.getAllLocal();
    }
    return this.getAllGitHub();
  }

  async getBySlug(slug: string): Promise<InvertContent | null> {
    const all = await this.getAll();
    return all.find((c) => c.slug === slug) ?? null;
  }

  async getByType(contentType: string): Promise<InvertContent[]> {
    const all = await this.getAll();
    return all.filter((c) => c.contentType === contentType);
  }

  private async getAllLocal(): Promise<InvertContent[]> {
    const results: InvertContent[] = [];
    let files: string[];

    try {
      files = await readdir(this.options.contentDir);
    } catch {
      return results;
    }

    for (const file of files) {
      if (extname(file) !== '.md') continue;
      const filePath = join(this.options.contentDir, file);
      const content = await this.parseMarkdownFile(filePath);
      if (content) results.push(content);
    }

    return results;
  }

  private async parseMarkdownFile(filePath: string): Promise<InvertContent | null> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(raw);
      const slug = (frontmatter.slug as string) ?? basename(filePath, '.md');
      const html = await markdownToHtml(body);

      const tags = frontmatter.tags as string[] | undefined;

      return {
        id: (frontmatter.id as string) ?? slug,
        slug,
        title: (frontmatter.title as string) ?? slug,
        body: html,
        contentType: (frontmatter.contentType as string) ?? 'post',
        date: frontmatter.date as string | undefined,
        modified: frontmatter.modified as string | undefined,
        author: frontmatter.author as string | undefined,
        excerpt: frontmatter.excerpt as string | undefined,
        featuredImage: frontmatter.featuredImage as string | undefined,
        taxonomies: tags ? { tags } : undefined,
        meta: frontmatter.meta as Record<string, unknown> | undefined,
      };
    } catch {
      return null;
    }
  }

  private async getAllGitHub(): Promise<InvertContent[]> {
    const { repo, branch = 'main', token, contentDir } = this.options;
    if (!repo) return [];

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const url = `https://api.github.com/repos/${repo}/contents/${contentDir}?ref=${branch}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];

    const files = (await res.json()) as Array<{ name: string; download_url: string }>;
    const results: InvertContent[] = [];

    for (const file of files) {
      if (!file.name.endsWith('.md')) continue;
      const fileRes = await fetch(file.download_url, { headers });
      if (!fileRes.ok) continue;
      const raw = await fileRes.text();
      const { frontmatter, body } = parseFrontmatter(raw);
      const slug = (frontmatter.slug as string) ?? basename(file.name, '.md');
      const html = await markdownToHtml(body);
      const tags = frontmatter.tags as string[] | undefined;

      results.push({
        id: (frontmatter.id as string) ?? slug,
        slug,
        title: (frontmatter.title as string) ?? slug,
        body: html,
        contentType: (frontmatter.contentType as string) ?? 'post',
        date: frontmatter.date as string | undefined,
        author: frontmatter.author as string | undefined,
        excerpt: frontmatter.excerpt as string | undefined,
        featuredImage: frontmatter.featuredImage as string | undefined,
        taxonomies: tags ? { tags } : undefined,
      });
    }

    return results;
  }
}
