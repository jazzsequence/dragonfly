import { join } from 'node:path';
import { JsonAdapter } from '../adapters/json.ts';
import { MarkdownAdapter } from '../adapters/markdown.ts';
import { DocsAdapter } from '../adapters/docs.ts';
import type { InvertAdapter } from '../adapters/interface.ts';

// process.cwd() is the project root in both Node.js and the Miniflare prerender
// environment (with nodejs_compat). Avoids import.meta.url which is undefined
// inside Cloudflare Workers.
const root = process.cwd();

export interface InvertConfig {
  siteName: string;
  siteUrl: string;
  adapters: InvertAdapter[];
}

export const invertConfig: InvertConfig = {
  siteName: 'Dragonfly',
  siteUrl: 'https://dragonfly.jazzsequence.com',

  adapters: [
    new JsonAdapter({ contentDir: join(root, 'content') }),
    new MarkdownAdapter({ source: 'local', contentDir: join(root, 'markdown') }),
    new DocsAdapter({ contentDir: join(root, 'docs') }),

    // Remote markdown from GitHub:
    // new MarkdownAdapter({
    //   source: 'github',
    //   repo: 'owner/repo',
    //   contentDir: 'content',
    //   branch: 'main',
    //   token: import.meta.env.GITHUB_TOKEN,
    // }),
  ],
};
