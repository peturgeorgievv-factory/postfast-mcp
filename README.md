# PostFast MCP Server

MCP server for the [PostFast](https://postfa.st) API — schedule and manage social media posts via AI tools like Claude.

## Quick Start

### 1. Get your API key

Go to **PostFast → Workspace Settings → API Key** and generate a key.

### 2. Install

**Option A — Claude Code Plugin (recommended):**

```shell
/plugin marketplace add peturgeorgievv-factory/postfast-mcp
/plugin install postfast@postfast-mcp
```

Then set your API key as an environment variable:

```bash
export POSTFAST_API_KEY="your-api-key-here"
```

**Option B — Manual `.mcp.json` config:**

Add to your project's `.mcp.json` or `~/.claude/.mcp.json` (global):

```json
{
  "mcpServers": {
    "postfast": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "postfast-mcp"],
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
- "Create a Facebook reel with this video"

## Available Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | List connected social media accounts |
| `list_posts` | List posts with filters (platform, status, date range) |
| `create_posts` | Create and schedule posts (batch, up to 15) |
| `delete_post` | Delete a post by ID |
| `upload_media` | Upload a local file and get a media key (handles the full flow) |
| `get_upload_urls` | Get signed URLs to upload media files |
| `list_pinterest_boards` | Get Pinterest boards for an account |
| `list_youtube_playlists` | Get YouTube playlists for an account |
| `generate_connect_link` | Generate a link for clients to connect accounts |

## Supported Platforms

Facebook, Instagram, X (Twitter), TikTok, LinkedIn, YouTube, BlueSky, Threads, Pinterest, Telegram

## Platform-Specific Controls

When creating posts, you can pass platform-specific settings via the `controls` parameter:

| Platform | Controls |
|----------|----------|
| **X (Twitter)** | `xCommunityId`, `xQuoteTweetUrl`, `xRetweetUrl` |
| **Instagram** | `instagramPublishType` (TIMELINE/STORY/REEL), `instagramPostToGrid`, `instagramCollaborators` |
| **Facebook** | `facebookContentType` (POST/REEL/STORY), `facebookAllowComments`, `facebookPrivacy`, `facebookReelsCollaborators` |
| **TikTok** | `tiktokPrivacy` (PUBLIC/MUTUAL_FRIENDS/ONLY_ME), `tiktokIsDraft`, `tiktokAllowComments`, `tiktokAllowDuet`, `tiktokAllowStitch`, `tiktokBrandOrganic`, `tiktokBrandContent`, `tiktokAutoAddMusic` |
| **YouTube** | `youtubeTitle`, `youtubePrivacy` (PUBLIC/PRIVATE/UNLISTED), `youtubeTags`, `youtubeCategoryId`, `youtubeIsShort`, `youtubeMadeForKids`, `youtubePlaylistId` |
| **Pinterest** | `pinterestBoardId` (required), `pinterestLink` |
| **LinkedIn** | `linkedinAttachmentKey`, `linkedinAttachmentTitle` |

## Media Upload

The `upload_media` tool handles the full flow in a single call:

1. Detects content type from file extension
2. Gets a signed upload URL from PostFast
3. Uploads the file
4. Returns a `key` and `type` ready to use in `create_posts`

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
