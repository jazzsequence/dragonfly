// @ts-check
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? 'https://dragonfly.jazzsequence.com';
const base = process.env.SITE_BASE ?? undefined;

// https://astro.build/config
export default defineConfig({
  site,
  base,
  output: 'static',
});
