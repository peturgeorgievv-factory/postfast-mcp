---
"postfast-mcp": patch
---

The server is also published to npm as `postfast`, so `npx -y postfast` starts the same server as `npx -y postfast-mcp`, at the same version. The MCP Registry entry is now `st.postfa/postfast`, a name verified through PostFast's own domain, postfa.st, and it lists the `postfast` package next to the hosted server. Both packages declare that name in `mcpName`. The previous entry, `io.github.peturgeorgievv-factory/postfast-mcp`, keeps its versions up to 0.15.3 and is marked deprecated with a pointer to the new name. The tools, the server instructions and the hosted connector don't change.
