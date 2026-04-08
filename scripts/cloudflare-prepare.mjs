/**
 * scripts/cloudflare-prepare.mjs
 *
 * Reorganizes `astro build` output (with @astrojs/cloudflare adapter) into the
 * format that Cloudflare Pages expects for _worker.js deployments.
 *
 * The adapter generates:
 *   dist/client/   ← static assets
 *   dist/server/   ← Cloudflare Worker entry + chunks
 *
 * Cloudflare Pages expects:
 *   dist/          ← static assets at root
 *   dist/_worker.js
 *   dist/chunks/   ← worker chunks (imported by _worker.js)
 *
 * Run after `astro build`.
 */

import { cpSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const client = join(dist, 'client');
const server = join(dist, 'server');

if (!existsSync(server)) {
  console.log('[cloudflare-prepare] dist/server not found — nothing to do');
  process.exit(0);
}

// 1. Flatten dist/client/** → dist/**
if (existsSync(client)) {
  cpSync(client, dist, { recursive: true });
  rmSync(client, { recursive: true, force: true });
  console.log('[cloudflare-prepare] dist/client/ → dist/');
}

// 2. Copy dist/server/chunks/ → dist/chunks/
const serverChunks = join(server, 'chunks');
const distChunks = join(dist, 'chunks');
if (existsSync(serverChunks)) {
  cpSync(serverChunks, distChunks, { recursive: true });
  console.log('[cloudflare-prepare] dist/server/chunks/ → dist/chunks/');
}

// 3. Rename dist/server/entry.mjs → dist/_worker.js
const entry = join(server, 'entry.mjs');
const worker = join(dist, '_worker.js');
if (existsSync(entry)) {
  cpSync(entry, worker);
  console.log('[cloudflare-prepare] dist/server/entry.mjs → dist/_worker.js');
}

// 4. Remove dist/server/
rmSync(server, { recursive: true, force: true });
console.log('[cloudflare-prepare] removed dist/server/');

// 5. Remove .wrangler/deploy/config.json — the adapter writes this pointing to
//    dist/server/wrangler.json, which no longer exists after step 4.
//    Without it, Wrangler falls back to detecting _worker.js at the dist root.
const wranglerDeploy = new URL('../.wrangler/deploy/config.json', import.meta.url).pathname;
if (existsSync(wranglerDeploy)) {
  rmSync(wranglerDeploy, { force: true });
  console.log('[cloudflare-prepare] removed .wrangler/deploy/config.json');
}

console.log('[cloudflare-prepare] done');
