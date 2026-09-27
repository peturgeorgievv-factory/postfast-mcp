---
"postfast-mcp": patch
---

The repository is now also a Cursor plugin. `.cursor-plugin/plugin.json` packages the stdio server, pinned to this release like the Claude Code plugin, together with the two skills. It declares `POSTFAST_API_KEY` as a plugin variable, which Cursor asks for at install, and it carries a logo (`assets/logo.png`). `npm run version` stamps its version and launcher pin along with the other manifests. The README gains an "Install in Cursor" section. The MCP server and its tools are unchanged, and the new files stay out of the npm package and the `.mcpb`.
