# postfast-mcp

## 0.2.0

### Minor Changes

- aa9b489: Extract the shared tool catalog to `postfast-mcp/core`: every tool is now authored once in `src/core` (zod schema, description, title, annotations, outputSchema, binding) and consumed by the stdio bin via a `BackendPort` REST adapter. The stdio surface is additive — all 13 tools gain title/annotations/outputSchema, initialize gains server instructions, and tool results gain structuredContent — plus sentence-level description upgrades ported from the richer remote twin. The bin entry moved to `dist/stdio/index.js`, zod is now a declared dependency, and releases run through changesets (trusted publishing to npm + MCP Registry + MCPB GitHub Release).
