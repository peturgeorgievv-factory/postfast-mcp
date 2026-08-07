# postfast-mcp

## 0.3.1

### Patch Changes

- Docs and hints for the inbox wave — no schema changes: server instructions (both bindings) gain a Social Inbox section (read flow, server-computed reply capability, comments-only framing), the README tool table covers all 23 tools, manifest.json lists the full tool set, and a `social-inbox` skill ships alongside the posting skill.

## 0.3.0

### Minor Changes

- a3bd898: Add the 10 social-inbox tools to the catalog (comments on TikTok Business / Instagram / Facebook Pages / Threads posts): list/get conversations, list items, unread count, public reply, Instagram private reply, hide/unhide/delete moderation, mark-read, status triage, and assignment — all `binding: 'both'`, with descriptions steering models to the server-computed reply capability (canReply / maxReplyLength / windowState / disabledReason). The stdio bin implements them over `/social-inbox/*`. The 10 new `BackendPort` methods are optional and the registrar skips (with a log) any tool whose port method is absent, so hosts on an older adapter deploy cleanly and pick the tools up when their adapter catches up. The release workflow now notifies social-schedule-mcp (`catalog-release` repository_dispatch) after a successful publish.

## 0.2.0

### Minor Changes

- aa9b489: Extract the shared tool catalog to `postfast-mcp/core`: every tool is now authored once in `src/core` (zod schema, description, title, annotations, outputSchema, binding) and consumed by the stdio bin via a `BackendPort` REST adapter. The stdio surface is additive — all 13 tools gain title/annotations/outputSchema, initialize gains server instructions, and tool results gain structuredContent — plus sentence-level description upgrades ported from the richer remote twin. The bin entry moved to `dist/stdio/index.js`, zod is now a declared dependency, and releases run through changesets (trusted publishing to npm + MCP Registry + MCPB GitHub Release).
