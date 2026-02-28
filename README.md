# PostFast MCP Server

MCP server for the [PostFast](https://postfast.io) API — schedule and manage social media posts via AI tools like Claude.

## Setup

### 1. Get your API key

Go to **PostFast → Workspace Settings → API Key** and generate a key.

### 2. Configure in Claude Code

Add to your `.mcp.json` (project) or `~/.claude.json` (global):

```json
{
  "mcpServers": {
    "postfast": {
      "type": "stdio",
      "command": "npx",
      "args": ["postfast-mcp"],
      "env": {
        "POSTFAST_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 3. Use it

Ask Claude things like:

- "List my connected social accounts"
- "Schedule a post to Instagram for tomorrow at 9am"
- "Show me all scheduled posts for this week"
- "Create a LinkedIn post with this content: ..."

## Available Tools

| Tool | Description |
|------|-------------|
| `list_posts` | List posts with filters (platform, status, date range) |
| `create_posts` | Create and schedule posts (batch, up to 15) |
| `delete_post` | Delete a post by ID |
| `list_accounts` | List connected social media accounts |
| `list_pinterest_boards` | Get Pinterest boards for an account |
| `list_youtube_playlists` | Get YouTube playlists for an account |
| `generate_connect_link` | Generate a link for clients to connect accounts |
| `get_upload_urls` | Get signed URLs to upload media files |

## Supported Platforms

Facebook, Instagram, X (Twitter), TikTok, LinkedIn, YouTube, BlueSky, Threads, Pinterest

## Media Upload Flow

1. Call `get_upload_urls` with the file's MIME type
2. Upload the file to the returned `signedUrl` via HTTP PUT
3. Use the returned `key` in the `mediaItems` array when calling `create_posts`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTFAST_API_KEY` | Yes | Your workspace API key |
| `POSTFAST_API_URL` | No | API base URL (default: `https://api.postfast.io`) |

## Development

```bash
npm install
npm run build
node dist/index.js
```

## License

MIT
