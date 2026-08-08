# PostFast MCP Server

MCP server for the [PostFast](https://postfa.st) API — schedule and manage social media posts via AI tools like Claude, Cursor, VS Code, and more.

## Hosted connector (no install)

Prefer not to run anything locally? Connect to the hosted endpoint and authenticate with OAuth — no npx, no API key to manage:

```
https://mcp.postfa.st/mcp
```

Add it as a remote/streamable-HTTP MCP server in any client that supports OAuth (e.g. ChatGPT, Claude). You'll be prompted to sign in to PostFast and authorize access on first use.

Want to run the server yourself instead? Use the npx + API-key setup in **Quick Start** below.

## Quick Start

### 1. Get your API key

Log in to [PostFast](https://app.postfa.st/dashboard), go to **API** in the sidebar, and generate a key.

### 2. Install

Choose your preferred method:

#### Claude Desktop (recommended)

Download the extension from the [Claude Desktop extension directory](https://claude.ai/extensions) or install manually:

1. Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "postfast": {
      "command": "npx",
      "args": ["-y", "postfast-mcp"],
      "env": {
        "POSTFAST_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

2. Restart Claude Desktop.

#### Claude Code

**Via plugin (pending marketplace approval):**

```shell
/plugin install postfast@claude-plugins-official
```

After installing, set your API key — pick one of these:

```bash
# Option A: Add to your shell profile (~/.zshrc or ~/.bashrc)
export POSTFAST_API_KEY="your-api-key-here"

# Option B: Add to ~/.claude/settings.local.json
# { "env": { "POSTFAST_API_KEY": "your-api-key-here" } }
```

Then restart Claude Code.

**Via manual config:**

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

#### Cursor / VS Code / Windsurf / Other MCP clients

Add to your MCP config (`.mcp.json`, `mcp.json`, or the tool's settings UI):

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

Ask your AI assistant things like:

- "List my connected social accounts"
- "Schedule a post to Instagram for tomorrow at 9am"
- "Show me all scheduled posts for this week"
- "Upload this image and create a LinkedIn post with it"
- "Create a Facebook reel with this video"
- "Show me analytics for my Instagram posts this month"

## Available Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | List connected social media accounts (each with `connectionStatus` — `CONNECTED`/`DISABLED` — `disabledReason`, `followerCount`/`followerCountUpdatedAt`, and `inboxCapable`) |
| `list_posts` | List posts with filters (specific IDs, platform, status, date range) |
| `create_posts` | Create and schedule posts (batch, up to 15) |
| `delete_post` | Delete a post by ID |
| `upload_media` | Upload a local file and get a media key (handles the full flow) |
| `get_upload_urls` | Get signed URLs to upload media files |
| `list_pinterest_boards` | Get Pinterest boards for an account |
| `list_youtube_playlists` | Get YouTube playlists for an account |
| `list_gbp_locations` | Get Google Business Profile locations for an account |
| `search_places` | Find a place to tag posts (the `id` works for both `facebookPlaceId` and `instagramLocationId`) |
| `generate_connect_link` | Generate a link for clients to connect accounts |
| `get_post_analytics` | Fetch published posts with performance metrics — Instagram, Facebook, TikTok, Threads, YouTube, LinkedIn (company pages), Pinterest (Business accounts) |
| `get_follower_history` | Daily follower-count history for an account (current count + `delta` over a date range) — Facebook Pages, Instagram, YouTube, Pinterest, Threads, Bluesky, Telegram, LinkedIn (company pages), TikTok |
| `list_tiktok_sounds` | Trending pre-cleared Commercial Music Library tracks for a TikTok account (attach via `controls.tiktokMusicSoundId`) |

### Social Inbox (comments)

Comments on your posts — TikTok, Instagram, Facebook Pages, and Threads — in one inbox. Comments only (no direct messages), from connect onward (no history backfill). Reply capability is always server-computed per conversation (`canReply`, `maxReplyLength`, `windowState`, `disabledReason`) — render from those fields, never platform assumptions.

| Tool | Description |
|------|-------------|
| `list_inbox_conversations` | List comment conversations (filters: platforms, accounts, statuses, unread-only, assignee) |
| `get_inbox_conversation` | Fetch one conversation with its reply-capability fields |
| `list_inbox_items` | List a conversation's comments and replies (with `state` and, on Instagram, `canPrivateReply`) |
| `get_inbox_unread_count` | Total unread comment count across the workspace |
| `reply_to_inbox_item` | Reply publicly under a specific comment |
| `send_inbox_private_reply` | Instagram only: one private reply per comment, within 7 days |
| `set_inbox_item_state` | HIDE / UNHIDE / DELETE a comment on the platform (DELETE cannot be undone) |
| `mark_inbox_conversation_read` | Zero a conversation's unread count |
| `set_inbox_conversation_status` | Triage: OPEN / SNOOZED / CLOSED |
| `assign_inbox_conversation` | Assign a conversation to a workspace member (or unassign) |

## Supported Platforms

Facebook, Instagram, X (Twitter), TikTok, LinkedIn, YouTube, BlueSky, Threads, Pinterest, Telegram, Google Business Profile

## Platform-Specific Controls

When creating posts, you can pass platform-specific settings via the `controls` parameter:

| Platform | Controls |
|----------|----------|
| **X (Twitter)** | `xRetweetUrl` |
| **Instagram** | `instagramPublishType` (TIMELINE/STORY/REEL), `instagramPostToGrid`, `instagramCollaborators`, `instagramLocationId`/`instagramLocationName` (geotag from `search_places`) |
| **Facebook** | `facebookContentType` (POST/REEL/STORY), `facebookAllowComments`, `facebookPrivacy`, `facebookCarouselMainLink`, `facebookCarouselShowEndCard`, `facebookReelsCollaborators`, `facebookTargetCountries` (ISO alpha-2, max 25), `facebookPlaceId`/`facebookPlaceName` (geotag from `search_places`) |
| **TikTok** | `tiktokTitle` (photo posts, max 90 chars), `tiktokMusicSoundId`/`tiktokMusicSoundName` (Commercial Music Library sound from `list_tiktok_sounds`; photo/carousel posts, exclusive with `tiktokAutoAddMusic`), `tiktokIsDraft`, `tiktokAllowComments`, `tiktokAllowDuet`, `tiktokAllowStitch`, `tiktokBrandOrganic`, `tiktokBrandContent`, `tiktokAutoAddMusic`, `tiktokIsAigc`, `tiktokPrivacy` (deprecated — account default applies) |
| **YouTube** | `youtubeTitle`, `youtubePrivacy` (PUBLIC/PRIVATE/UNLISTED), `youtubeTags`, `youtubeCategoryId`, `youtubeIsShort`, `youtubeMadeForKids`, `youtubePlaylistId`, `youtubeThumbnailKey` |
| **Pinterest** | `pinterestBoardId` (required), `pinterestLink` |
| **LinkedIn** | `linkedinAttachmentKey`, `linkedinAttachmentTitle` |
| **Google Business Profile** | `gbpLocationId` (required), `gbpTopicType` (STANDARD/EVENT/OFFER), `gbpCallToActionType`, `gbpCallToActionUrl`, `gbpEventTitle`, `gbpEventStartDate`, `gbpEventEndDate`, `gbpOfferCouponCode`, `gbpOfferRedeemUrl`, `gbpOfferTerms` |

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

## Testing

Verify everything works with the MCP Inspector:

```bash
POSTFAST_API_KEY=your-key npx @modelcontextprotocol/inspector npx postfast-mcp
```

## API Docs

Full REST API documentation: [postfa.st/docs](https://postfa.st/docs)

## Development

```bash
npm install
npm run build
node dist/stdio/index.js
```

Tools are authored once in `src/core` (the catalog — schemas, descriptions,
annotations, per-binding availability) and exposed to consumers as
`postfast-mcp/core`; `src/stdio` binds the catalog to the public REST API.
Releases: PRs add a `.changeset/*.md`; `npm run version` folds them into the
bump + changelog, and pushing the `vX.Y.Z` tag publishes npm + MCP Registry +
the MCPB release from CI (OIDC — no tokens anywhere).

## Badges

[![peturgeorgievv-factory/postfast-mcp MCP server](https://glama.ai/mcp/servers/peturgeorgievv-factory/postfast-mcp/badges/score.svg)](https://glama.ai/mcp/servers/peturgeorgievv-factory/postfast-mcp)

## License

MIT
