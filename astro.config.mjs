// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// For GitHub Pages project sites, set SITE_BASE to the repo name (e.g. /invert).
// Leave unset for root deployments (custom domain or Cloudflare Pages).
const site = process.env.SITE_URL ?? 'https://dragonfly.jazzsequence.com';
const base = process.env.SITE_BASE ?? undefined;

// https://astro.build/config
export default defineConfig({
  site,
  base,
  output: 'server',
  adapter: cloudflare(),
});
