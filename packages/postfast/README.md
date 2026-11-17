# postfast

The MCP server of [PostFast](https://postfa.st), the social media scheduler. It lets AI tools such as Claude, Cursor and VS Code schedule posts on 11 social networks, answer comments and read analytics.

This package runs the same server as [`postfast-mcp`](https://www.npmjs.com/package/postfast-mcp), at the same version. PostFast publishes both from [one repository](https://github.com/peturgeorgievv-factory/postfast-mcp).

## Run it

Get an API key: log in to [PostFast](https://app.postfa.st/dashboard) and open **API** in the sidebar. Then add the server to your MCP client's config:

```json
{
  "mcpServers": {
    "postfast": {
      "command": "npx",
      "args": ["-y", "postfast"],
      "env": {
        "POSTFAST_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

In Claude Code:

```bash
claude mcp add --scope user postfast --env POSTFAST_API_KEY=your-api-key-here -- npx -y postfast
```

## Hosted server

To skip the install and the API key, connect any MCP client that supports OAuth to `https://mcp.postfa.st/mcp` and sign in to PostFast when it asks.

## Official PostFast packages

| Where | Name |
| --- | --- |
| npm | `postfast`, `postfast-mcp`, `n8n-nodes-postfast` |
| MCP Registry | `st.postfa/postfast` |
| Hosted MCP server | `https://mcp.postfa.st/mcp` |
| REST API | `https://api.postfa.st` |

An API key gives full access to its workspace. Give it only to these packages and endpoints, or to your own code that calls the API.

The tool list, setup for each client and the changelog are on [GitHub](https://github.com/peturgeorgievv-factory/postfast-mcp).

## License

MIT
