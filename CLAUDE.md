# CLAUDE.md

Public **stdio MCP server** (npm: `postfast-mcp`) over PostFast's pf-api-key REST API — and the home of the **shared tool catalog** (`src/core`, exported as `postfast-mcp/core`). The deployed remote twin `../social-schedule-mcp` (mcp.postfa.st) consumes the catalog too (its adapter PR is step 2 of the periphery plan; until it lands, treat that repo as read-only frozen).

## Rules

- **Source of truth is the backend**: `../social-schedule-service` — its `docs/periphery.md` holds the constellation map (repos, verify commands, release channels).
- **Tool descriptions ARE the API** — models discover fields only from descriptions/schemas, so wording changes are behavior changes. Keep them accurate against the BE REST responses.
- **The catalog IS the single source**: every tool (schema + description + title + annotations + outputSchema + binding) lives ONLY in `src/core/tools/`. Never author tool text anywhere else; both bindings render from it.
- stdio surface stability: `scripts/parity-diff.mjs` diffs a published version against the local build (initialize + tools/list over real stdio). Run it before any release that touches the catalog.
- **Workflow security**: `release.yml`'s dispatch authenticates as the release-bot GitHub App (`RELEASE_BOT_APP_ID` + `RELEASE_BOT_PRIVATE_KEY`; the private key is the critical credential) — it mints a short-lived token scoped to social-schedule-mcp only. Reference secrets ONLY on the step that uses them, never job/workflow level. This repo must NEVER gain a `pull_request_target` workflow that checks out PR code, and no secret-bearing workflow may interpolate PR-controlled strings (titles, branch names, bodies).
- Never commit with AI/Claude attribution or Co-authored-by.

## Release (tag-triggered — CI holds no credentials)

1. Every behavior-changing PR adds a `.changeset/*.md` (patch/minor + summary).
2. To release: `npm run version` (changesets computes the bump + CHANGELOG, `scripts/stamp-versions.mjs` stamps manifest.json, server.json, both `.claude-plugin/` files, `src/stdio/index.ts`, package-lock.json) → review the diff → commit ("…, bump to X" style).
3. **Pushing the tag is the publish button**: `git tag vX.Y.Z && git push origin main vX.Y.Z`. `release.yml` then publishes npm (trusted publishing/OIDC), the MCP Registry (github-oidc), and a GitHub Release with the `.mcpb` attached. A tag that doesn't match package.json fails fast. The repository_dispatch to `social-schedule-mcp` is stubbed until its receiver exists. Registry hiccup? Re-run via the workflow's manual `workflow_dispatch` (registry-republish job).
