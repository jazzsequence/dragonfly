---
title: Deploying to Cloudflare Pages
slug: cloudflare-pages
contentType: docs
date: 2026-04-08
excerpt: How to deploy an Invert site to Cloudflare Pages using Wrangler CLI, including the native HTTP MCP server.
---

# Deploying to Cloudflare Pages

Cloudflare Pages hosts your static Invert site and runs the MCP server at the edge via a Pages Function. Once deployed, AI tools can connect to your site's `/api/mcp` endpoint directly — no local process required.

> **Use Wrangler CLI for setup.** The Cloudflare dashboard UI for connecting a GitHub repository is unreliable. The CLI approach below works consistently.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- Your site repository on GitHub
- Node.js 22+

## Step 1 — Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens a browser window. Authorize Wrangler and return to the terminal.

## Step 2 — Create the Pages project

```bash
npx wrangler pages project create dragonfly --production-branch main
```

Replace `dragonfly` with your project name. This creates the project in your Cloudflare account. Cloudflare will assign a `*.pages.dev` domain — note it for Step 4.

## Step 3 — Build the site

```bash
npm run build
```

This runs `astro build` followed by `scripts/generate-manifest.mjs`, which writes `dist/_api/content.json` — the content manifest used by the edge MCP server.

## Step 4 — Set SITE_URL and rebuild

Open `astro.config.mjs` — the `SITE_URL` environment variable controls the canonical site URL. Set it before building for production:

```bash
SITE_URL=https://dragonfly.pages.dev npm run build
```

Replace `dragonfly.pages.dev` with your assigned domain from Step 2.

## Step 5 — Deploy

```bash
npx wrangler pages deploy dist/
```

Wrangler uploads the static site and the Pages Function (`functions/api/mcp.ts`) together. Your site is live.

## Step 6 — Set up automated deployments (GitHub Actions)

Future deploys can run automatically on push to `main`. You need two secrets in your GitHub repository.

**Get your Account ID:**

```bash
npx wrangler whoami
```

The account ID is printed in the output.

**Create an API token:**

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token** → use the **Cloudflare Pages** template
3. Scope it to your account, click through to create, and copy the token

**Add secrets to GitHub:**

Go to your repo → **Settings → Secrets and variables → Actions** and add:

- `CLOUDFLARE_API_TOKEN` — the token you just created
- `CLOUDFLARE_ACCOUNT_ID` — from `wrangler whoami`

Also add a **repository variable** (not a secret) for the site URL:

- Go to **Settings → Secrets and variables → Actions → Variables**
- Add `SITE_URL` = `https://dragonfly.pages.dev`

The workflow at `.github/workflows/deploy-cloudflare.yml` runs on every push to `main` and handles the build and deploy automatically.

## Connecting the MCP server

Your MCP server is available at `https://your-project.pages.dev/api/mcp`.

To connect it to Claude Code, add to your MCP config (`~/.claude/mcp.json` or `.mcp.json` in the project):

```json
{
  "mcpServers": {
    "dragonfly": {
      "url": "https://dragonfly.pages.dev/api/mcp"
    }
  }
}
```

The edge MCP server is **read-only**: it supports `invert_list`, `invert_get`, `invert_search`, and `invert_types`. Write tools (`invert_create`, `invert_update`, `invert_delete`) require the local MCP server (`npm run mcp`), which has filesystem access.

## Local preview with Wrangler

To test the Pages Function locally before deploying:

```bash
npm run build
npx wrangler pages dev dist/
```

This starts a local server at `http://localhost:8788` with the static site and MCP function running together. The MCP endpoint will be at `http://localhost:8788/api/mcp`.

## Custom domain

1. In the Cloudflare dashboard: **Workers & Pages → your project → Custom domains**
2. Add your domain and follow the DNS instructions
3. Update `SITE_URL` in GitHub repository variables to your custom domain
4. Trigger a redeploy (push a commit or run the workflow manually)
