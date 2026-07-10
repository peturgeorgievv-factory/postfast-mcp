# CLAUDE.md

Public **stdio MCP server** (npm: `postfast-mcp`) over PostFast's pf-api-key REST API. The deployed remote twin is `../social-schedule-mcp` (mcp.postfa.st, zod 3 — this repo is zod 4).

## Rules

- **Source of truth is the backend**: `../social-schedule-service` — its `docs/periphery.md` holds the constellation map (repos, verify commands, release channels).
- **Tool descriptions ARE the API** — models discover fields only from descriptions/schemas, so wording changes are behavior changes. Keep them accurate against the BE REST responses.
- Any schema/description change must be **mirrored in the remote twin** (`social-schedule-mcp`) until the shared tool catalog lands.
- Never commit with AI/Claude attribution or Co-authored-by.

## Release

1. `node scripts/bump-version.mjs patch` — stamps package.json, package-lock.json, src/index.ts, manifest.json, server.json, and both `.claude-plugin/` files in one shot.
2. `npm run build` to verify (tsc → `dist/`).
3. `npm publish` (manual until CI lands).
