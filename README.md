# PostFast MCP Server

MCP server for the [PostFast](https://postfa.st) API — schedule and manage social media posts via AI tools like Claude.

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
- "Upload this image and create a LinkedIn post with it"

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
| `upload_media` | Upload a local file and get a media key (handles the full flow) |

## Supported Platforms

Facebook, Instagram, X (Twitter), TikTok, LinkedIn, YouTube, BlueSky, Threads, Pinterest, Telegram

## Media Upload

The `upload_media` tool handles the full flow in a single call:

1. Detects content type from file extension
2. Gets a signed upload URL from PostFast
3. Uploads the file
4. Returns a `key` and `mediaType` ready to use in `create_posts`

Supported formats: JPEG, PNG, GIF, WebP, MP4, WebM, MOV

You can also use `get_upload_urls` directly if you need more control over the upload process.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTFAST_API_KEY` | Yes | Your workspace API key |
| `POSTFAST_API_URL` | No | API base URL (default: `https://api.postfa.st`) |

## API Docs

Full REST API documentation: [postfa.st/docs](https://postfa.st/docs)

## Development

```bash
npm install
npm run build
node dist/index.js
```

## License

MIT
