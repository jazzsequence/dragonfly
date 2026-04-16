#!/usr/bin/env bash
# sync-upstream.sh — Pull core file updates from the Invert template upstream
#
# Usage:
#   bash scripts/sync-upstream.sh
#
# What it syncs:
#   Core framework files that Invert owns and implementations should not
#   modify directly: adapters, content lib, MCP tools/server, edge MCP,
#   build scripts, and the CI workflow.
#
# What it leaves alone:
#   src/lib/config.ts    — adapter registration (you configure this)
#   CLAUDE.md            — project-specific AI instructions
#   content/             — your content
#   markdown/            — your markdown content
#   docs/                — your docs content
#   wrangler.jsonc       — your Cloudflare project settings
#   .mcp.json            — your MCP connection config
#   package.json         — dependency changes are shown but not applied

set -euo pipefail

UPSTREAM_REMOTE="${INVERT_REMOTE:-invert}"
UPSTREAM_URL="${INVERT_URL:-https://github.com/jazzsequence/Invert.git}"
UPSTREAM_BRANCH="${INVERT_BRANCH:-main}"
SYNC_BRANCH="invert-sync-$(date +%Y%m%d)"

# Core files/directories to pull from upstream
CORE_PATHS=(
  src/adapters/interface.ts
  src/adapters/json.ts
  src/adapters/markdown.ts
  src/adapters/docs.ts
  src/lib/content.ts
  src/lib/utils.ts
  src/pages/
  src/layouts/
  src/components/
  mcp/tools.ts
  mcp/server.ts
  cloudflare/
  scripts/
  tests/
  .github/workflows/ci.yml
)

# ── Setup remote ──────────────────────────────────────────────────────────────

if git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
  echo "→ Remote '$UPSTREAM_REMOTE' already exists, fetching..."
else
  echo "→ Adding remote '$UPSTREAM_REMOTE' → $UPSTREAM_URL"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" --quiet
echo "→ Fetched $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"

# ── Check for changes ─────────────────────────────────────────────────────────

CHANGED_CORE=$(git diff HEAD.."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" -- "${CORE_PATHS[@]}" 2>/dev/null | wc -l | tr -d ' ')

if [ "$CHANGED_CORE" -eq 0 ]; then
  echo ""
  echo "✅ Core files are already up to date with $UPSTREAM_REMOTE/$UPSTREAM_BRANCH."
  exit 0
fi

echo ""
echo "Changes found in core files:"
git diff --stat HEAD.."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" -- "${CORE_PATHS[@]}"

# ── Show package.json diff separately (not auto-applied) ─────────────────────

PKG_DIFF=$(git diff HEAD.."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" -- package.json 2>/dev/null | wc -l | tr -d ' ')
if [ "$PKG_DIFF" -gt 0 ]; then
  echo ""
  echo "⚠️  package.json has upstream changes (not auto-applied — review manually):"
  git diff HEAD.."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" -- package.json
fi

# ── Create sync branch ────────────────────────────────────────────────────────

echo ""
if git show-ref --verify --quiet "refs/heads/$SYNC_BRANCH"; then
  echo "→ Branch '$SYNC_BRANCH' already exists, switching to it..."
  git checkout "$SYNC_BRANCH"
else
  echo "→ Creating sync branch: $SYNC_BRANCH"
  git checkout -b "$SYNC_BRANCH"
fi

# Apply core file updates
git checkout "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" -- "${CORE_PATHS[@]}"

echo ""
echo "✅ Core files updated from $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
echo ""
echo "Next steps:"
echo "  1. Review: git diff HEAD"
echo "  2. Run:    npm install && npm test"
echo "  3. Commit: git commit -m 'chore: sync core files from Invert upstream'"
echo "  4. Push:   git push origin $SYNC_BRANCH"
echo "  5. Open a PR to merge into main"
echo ""
if [ "$PKG_DIFF" -gt 0 ]; then
  echo "  ⚠️  Remember to review and apply package.json changes manually."
fi
