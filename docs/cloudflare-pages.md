---
title: Deploying to Cloudflare Pages
slug: cloudflare-pages
contentType: docs
date: 2026-04-08
excerpt: How to deploy an Invert site to Cloudflare Pages, including the native HTTP MCP server.
---

# Deploying to Cloudflare Pages

Cloudflare Pages is a static hosting platform with optional edge functions. Invert deploys cleanly as a static site, and includes a Pages Function that exposes the MCP server over HTTP so AI tools can connect to your deployed site directly — no local process required.

## What you get

- Static Astro site deployed to a `*.pages.dev` domain (or custom domain)
- `/api/mcp` endpoint — the Invert MCP server running at the edge, accessible to any MCP-compatible AI tool
- Automatic redeploys on push to `main` via GitHub Actions

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- Your site repository on GitHub

## Step 1 — Connect your repo to Cloudflare Pages

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click **Workers & Pages** in the left sidebar
3. Click **Create** → under "Pages", click **Get started** next to "Import an existing Git repository"
4. Click **Connect GitHub** and authorize the Cloudflare GitHub App
   - If your repo doesn't appear after authorization, go to **GitHub → Settings → Applications → Installed GitHub Apps → Cloudflare Pages → Configure** and add your repository under "Repository access"
5. Select your repository and click **Begin setup**

## Step 2 — Configure the build

| Setting | Value |
|---|---|
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version (Environment variable) | `NODE_VERSION` = `22` |

Add the `NODE_VERSION` environment variable in the **Environment variables** section before saving.

Click **Save and Deploy**.

## Step 3 — Set SITE_URL

Once the first deploy completes, Cloudflare assigns a `*.pages.dev` URL (e.g., `dragonfly-abc.pages.dev`).

1. Go to your Pages project → **Settings → Environment variables**
2. Add: `SITE_URL` = `https://your-project.pages.dev`
3. Go to **Deployments** and click **Retry deployment** (or push a commit) to rebuild with the correct URL

## Step 4 — Add GitHub secrets for CI/CD

Automated deployments on push require two secrets in your GitHub repository.

**Get your Cloudflare Account ID:**
- It appears in the right sidebar on any page in the Cloudflare dashboard, or under **Workers & Pages → Overview**

**Create an API Token:**
1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token** → use the **Cloudflare Pages** template
3. Under "Account resources", select your account
4. Click **Continue to summary** → **Create Token**
5. Copy the token (you won't see it again)

**Add to GitHub:**
1. Go to your repo → **Settings → Secrets and variables → Actions**
2. Add `CLOUDFLARE_API_TOKEN` (the token you just created)
3. Add `CLOUDFLARE_ACCOUNT_ID` (your account ID)

The workflow in `.github/workflows/deploy-cloudflare.yml` will now run on every push to `main`.

## Step 5 — Set the project name in the workflow

Open `.github/workflows/deploy-cloudflare.yml` and confirm `projectName` matches the name shown in your Cloudflare Pages dashboard (default: `dragonfly`).

## Connecting the MCP server

Once deployed, your MCP server is available at `https://your-project.pages.dev/api/mcp`.

To connect it to Claude Code (or another MCP client), add to your MCP config:

```json
{
  "mcpServers": {
    "dragonfly": {
      "url": "https://your-project.pages.dev/api/mcp"
    }
  }
}
```

The edge MCP server is **read-only** — it supports `invert_list`, `invert_get`, `invert_search`, and `invert_types`. Write operations (`invert_create`, `invert_update`, `invert_delete`) require the local MCP server (`npm run mcp`) which has filesystem access.

## How the edge MCP works

At build time, `scripts/generate-manifest.mjs` reads all content from `content/`, `markdown/`, and `docs/` and writes a manifest to `dist/_api/content.json`. This file is deployed as a static asset alongside the site.

At runtime, the Pages Function at `functions/api/mcp.ts` fetches `/_api/content.json` via the Cloudflare ASSETS binding and serves MCP responses over HTTP.

## Custom domain

To use a custom domain instead of `*.pages.dev`:

1. In your Pages project → **Custom domains** → **Set up a custom domain**
2. Enter your domain and follow the DNS instructions
3. Update `SITE_URL` in GitHub repository variables to your custom domain
4. Redeploy

## Local preview with Wrangler

To test the Pages Function locally before deploying:

```bash
npm run build
npx wrangler pages dev dist/
```

This starts a local server at `http://localhost:8788` with the static site and the MCP function running together.
