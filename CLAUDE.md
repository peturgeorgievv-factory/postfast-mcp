# CLAUDE.md

Public **stdio MCP server** (npm: `postfast-mcp`) over PostFast's pf-api-key REST API — and the home of the **shared tool catalog** (`src/core`, exported as `postfast-mcp/core`). The deployed remote twin `../social-schedule-mcp` (mcp.postfa.st) consumes the catalog too (its adapter PR is step 2 of the periphery plan; until it lands, treat that repo as read-only frozen).

## Rules

- **Source of truth is the backend**: `../social-schedule-service` — its `docs/periphery.md` holds the constellation map (repos, verify commands, release channels).
- **Tool descriptions ARE the API** — models discover fields only from descriptions/schemas, so wording changes are behavior changes. Keep them accurate against the BE REST responses.
- **The catalog IS the single source**: every tool (schema + description + title + annotations + outputSchema + binding) lives ONLY in `src/core/tools/`. Never author tool text anywhere else; both bindings render from it.
- stdio surface stability: `scripts/parity-diff.mjs` diffs a published version against the local build (initialize + tools/list over real stdio). Run it before any release that touches the catalog.
- Never commit with AI/Claude attribution or Co-authored-by.

## Release (changesets — no laptop publishing)

1. Every behavior-changing PR adds a `.changeset/*.md` (patch/minor + summary).
2. Merging to main makes `release.yml` open/update the **Version Packages PR** (`changeset version` + `scripts/stamp-versions.mjs` stamps manifest.json, server.json, both `.claude-plugin/` files, `src/stdio/index.ts`, package-lock.json).
3. **Merging the Version Packages PR is the publish button**: npm via trusted publishing (OIDC, no tokens), then MCP Registry (`mcp-publisher login github-oidc`), then the `.mcpb` bundle attached to the GitHub Release. The repository_dispatch to `social-schedule-mcp` is stubbed in `release.yml` until its receiver exists.
