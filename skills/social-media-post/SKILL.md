---
name: social-media-post
description: Create, schedule, and manage social media posts using PostFast. Use when the user wants to publish, schedule, or manage posts on Facebook, Instagram, X (Twitter), TikTok, LinkedIn, YouTube, BlueSky, Threads, Pinterest, or Telegram.
---

# Social Media Post via PostFast

You have access to PostFast MCP tools for social media scheduling and management.

## Setup Check

If any PostFast tool call fails with an authentication/401 error, tell the user:
1. Go to https://app.postfa.st/dashboard, click **API** in the sidebar, and generate a key
2. Set the `POSTFAST_API_KEY` environment variable with the key

## Posting Workflow

1. **List accounts** — Call `list_accounts` to see connected social media accounts. Each account has an `id`, `platform`, `platformUsername`, and `displayName`.

2. **Prepare media** (if needed) — If the user has images or videos to attach:
   - Use `upload_media` with the local file path — it handles getting a signed URL, uploading, and returning a `key` and `type` (IMAGE or VIDEO)
   - Supported formats: JPEG, PNG, GIF, WebP (images), MP4, WebM, MOV (video)
   - Size limits: 10MB images, 250MB video, 60MB documents (PDF/DOC/DOCX/PPT/PPTX)

3. **Create posts** — Call `create_posts` with:
   - `socialMediaId`: account ID from step 1
   - `content`: the post text/caption
   - `scheduledAt`: ISO 8601 datetime (required unless status is DRAFT)
   - `mediaItems`: array of `{key, type, sortOrder}` from uploaded media
   - `status`: SCHEDULED (default) or DRAFT
   - `firstComment`: optional first comment text (supported on X, Instagram, Facebook, YouTube, Threads)
   - `controls`: platform-specific settings (see below)
   - You can batch up to 15 posts in a single call — great for content calendars

4. **Confirm** — Show the user a summary: which accounts, what content, when scheduled.

## Platform-Specific Controls

### X (Twitter)
- `xCommunityId`: post to a specific Community
- `xQuoteTweetUrl`: URL of tweet to quote (supports content + media alongside)
- `xRetweetUrl`: URL of tweet to retweet (ignores content/media)
- Cannot use both quote and retweet at the same time

### Instagram
- `instagramPublishType`: TIMELINE (default), STORY, or REEL
- `instagramPostToGrid`: boolean, default true (for Reels)
- `instagramCollaborators`: array of usernames to invite as collaborators

### Facebook
- `facebookContentType`: POST (default), REEL, or STORY
  - POST: up to 10 photos OR 1 video
  - REEL: 1 video only
  - STORY: 1 image OR 1 video
- `facebookReelsCollaborators`: array of usernames (for Reels)

### TikTok
- `tiktokPrivacy`: PUBLIC (default), MUTUAL_FRIENDS, FOLLOWER_OF_CREATOR, or ONLY_ME
- `tiktokIsDraft`: boolean, default false
- `tiktokAllowComments`: boolean, default true
- `tiktokAllowDuet`: boolean, default true
- `tiktokAllowStitch`: boolean, default true
- `tiktokBrandOrganic`: boolean, default false
- `tiktokBrandContent`: boolean, default false
- `tiktokAutoAddMusic`: boolean, default false
- `tiktokIsAigc`: boolean, default false (declare video as AI-generated content)

### YouTube
- `youtubeTitle`: defaults to first 100 chars of content
- `youtubePrivacy`: PUBLIC (default), PRIVATE, or UNLISTED
- `youtubeTags`: array of tag strings
- `youtubeCategoryId`: YouTube category ID
- `youtubeIsShort`: boolean, default true
- `youtubeMadeForKids`: boolean, default false (COPPA compliance)
- `youtubePlaylistId`: playlist ID (use `list_youtube_playlists` to find it)
- `youtubeThumbnailKey`: S3 media key for custom video thumbnail (upload via `upload_media` or `get_upload_urls`; JPEG/PNG recommended, max 2MB, min 640px wide, 1280x720 ideal; requires phone-verified YouTube channel)

### Pinterest
- `pinterestBoardId`: **required** — use `list_pinterest_boards` to get the `boardId`
- `pinterestLink`: destination URL when pin is clicked
- Content is parsed as: first line = pin title (max 100 chars), remaining lines = description (max 800 chars)
- Carousel: 2-5 static images (no videos)

### LinkedIn
- `linkedinAttachmentKey`: S3 key for document attachment (for document posts)
- `linkedinAttachmentTitle`: display title for the document (default "Document")
- Cannot mix documents with regular image/video media
- Supported document formats: PDF, DOC, DOCX, PPT, PPTX (max 60MB)

## Other Actions

- **View posts**: `list_posts` — filter by `platforms` (comma-separated), `statuses` (DRAFT, SCHEDULED, PUBLISHED, FAILED), `from`/`to` dates, with pagination (`page`, `limit` up to 50)
- **Post analytics**: `get_post_analytics` — fetch published posts with performance metrics. Requires `startDate` and `endDate` (ISO 8601). Optional filters: `platforms`, `socialMediaIds`. Returns impressions, reach, likes, comments, shares, totalInteractions. Supported: Instagram, Facebook, TikTok, Threads, YouTube, LinkedIn (company pages). Note: LinkedIn personal accounts are excluded; `latestMetric` is null if metrics haven't been fetched yet; metric values are strings (bigint). Keep date ranges reasonable as there's no pagination.
- **Delete a post**: `delete_post` with the post ID
- **Connect new accounts**: `generate_connect_link` — creates a secure URL to share with clients/collaborators to connect their accounts. Set `expiryDays` (1-30) and optionally `sendEmail` with an `email` address
- **Pinterest boards**: `list_pinterest_boards` — get board IDs before creating Pinterest posts
- **YouTube playlists**: `list_youtube_playlists` — get playlist IDs for adding videos to playlists

## Tips

- Always confirm schedule time and target accounts with the user before creating posts.
- For content calendars, batch multiple posts in one `create_posts` call (up to 15).
- When posting to Pinterest, always fetch boards first — `pinterestBoardId` is required.
- Use DRAFT status if the user wants to review posts in the PostFast dashboard before they go live.
- The `firstComment` feature is useful for adding hashtags on Instagram without cluttering the caption.
