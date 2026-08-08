import type { Binding } from './tool-def.js';

/**
 * Server `instructions` sent at MCP `initialize` — standing guidance the client
 * model reads before calling tools. Grounded in the PostFast docs + the
 * backend's actual create-posts validation, so it matches what the API
 * enforces (prevents the model discovering rules by failing).
 *
 * The two bindings differ only where their tool surfaces differ: workspace
 * switching and conversation-media/URL uploads exist on the remote host, the
 * stdio bin uploads local files instead.
 */

const SHARED_TAIL = `Before scheduling, confirm the target account's connectionStatus is CONNECTED. A DISABLED account will not publish (disconnected accounts are the #1 cause of failed posts) — saving a DRAFT is still allowed.

Status & timing: status=SCHEDULED requires scheduledAt on every post (ISO-8601, in the future, within 1 year); status=DRAFT must omit scheduledAt. approvalStatus=APPROVED publishes; PENDING_APPROVAL holds it for review. There is no instant "publish now" — for an immediate post, set scheduledAt a few minutes ahead of now (a time at or before the current moment is rejected).

Media: use the key returned by an upload tool, and set mediaItems[].type to match the file (IMAGE for image/* keys, VIDEO for video/* keys — a mismatch is rejected). Videos are capped at 250MB (Telegram 50MB, Bluesky 100MB). Media is REQUIRED on TikTok, YouTube (video only), Instagram, Pinterest, and Google Business Profile; X, LinkedIn, Facebook, Threads, Bluesky, and Telegram allow text-only posts. This requirement applies even to DRAFTS — a draft to a media-required platform without media is rejected. So if the user asks to post to a media-required platform and provides no media, ask them for an image/video (or generate and upload one) BEFORE calling create_posts; don't attempt the post without media.

Per-platform limits (media counts / characters):
- X: up to 4 images or 1 video (no mixing); 280 chars (4,000 with X Premium).
- TikTok: 1 video OR up to 10 images; 4,000 chars.
- Instagram: up to 10 images + 10 videos (mixed OK); 2,200 chars, max 30 hashtags.
- YouTube: 1 video, no images; title max 100 chars.
- Facebook / LinkedIn: up to 10 images + 1 video.
- Threads: up to 10 images + 10 videos; 500 chars.
- Pinterest: up to 5 images or 1 video; title max 100, description max 800.
- Google Business Profile: 1 image; 1,500 chars.
- Bluesky: up to 4 images or 1 video. Telegram: up to 10 images + 3 videos.
If content exceeds the target platform's character limit, don't schedule it as-is — tell the user and offer to shorten or split it (X is 280 unless the account has X Premium = 4,000).

Platform-specific options go in the controls object, e.g.:
- Pinterest: controls.pinterestBoardId is REQUIRED — it is a board's boardId from list_pinterest_boards, NOT the Pinterest account's socialMediaId.
- Google Business Profile: controls.gbpLocationId is required — the locationId from list_gbp_locations.
- YouTube: controls.youtubePlaylistId is the playlistId from list_youtube_playlists; youtubeIsShort defaults true; title falls back to the first 100 chars of content.
- TikTok: controls.tiktokPrivacy is deprecated (videos use the account default, photos default to public); tiktokTitle applies to photo carousels only (max 90); firstComment (max 150, comments must be enabled).
- Instagram: controls.instagramPublishType = TIMELINE | STORY | REEL.
- Facebook: controls.facebookContentType = POST | REEL | STORY. controls.facebookTargetCountries limits who can see a FEED post by country (ISO 3166-1 alpha-2, max 25; not Reels/Stories).
- Geotag a place (Facebook/Instagram): call search_places, then pass a returned id as controls.facebookPlaceId (Facebook feed posts only — not Reels/Stories/video) and/or controls.instagramLocationId (Instagram single media only — not carousels). One id works for both.
- LinkedIn: attach a document via controls.linkedinAttachmentKey.
- X: controls.xRetweetUrl reposts an existing tweet (content/media are ignored).
Note: list_pinterest_boards / list_youtube_playlists / list_gbp_locations take the account's socialMediaId; each returned item has BOTH an internal id and the platform id (boardId / playlistId / locationId) — pass the PLATFORM id to controls, not the internal id or the account id.

Failed posts carry lastError — usually a disconnected account (reconnect, then retry) or platform-rejected media.

Social inbox (comments on your posts — TikTok, Instagram, Facebook Pages, Threads): read with list_inbox_conversations → list_inbox_items (get_inbox_unread_count for the total), reply with reply_to_inbox_item (public, under a specific comment item) or send_inbox_private_reply (Instagram only: one per comment, within 7 days). Whether and how long a reply can be comes ONLY from the conversation's server-computed canReply / maxReplyLength / windowState / disabledReason — never assume platform rules. Moderate with set_inbox_item_state (HIDE / UNHIDE / DELETE — DELETE removes the comment on the platform and cannot be undone), triage with set_inbox_conversation_status and assign_inbox_conversation, and call mark_inbox_conversation_read after presenting a thread. It is a comments inbox — never present it as DMs or messages.`;

const STDIO_INSTRUCTIONS = `PostFast schedules and publishes social posts across X, Instagram, Facebook, TikTok, LinkedIn, YouTube, Threads, Pinterest, Bluesky, Telegram, and Google Business Profile.

Flow: list_accounts to see what's connected → create_posts (one socialMediaId per post; batch up to 15) → attach media via upload_media (a local file, by absolute path) or get_upload_urls (signed PUT upload for raw bytes) → a post publishes when status=SCHEDULED and approvalStatus=APPROVED.

The POSTFAST_API_KEY is workspace-scoped — every tool acts in that workspace.

${SHARED_TAIL}`;

const REMOTE_INSTRUCTIONS = `PostFast schedules and publishes social posts across X, Instagram, Facebook, TikTok, LinkedIn, YouTube, Threads, Pinterest, Bluesky, Telegram, and Google Business Profile.

Flow: list_accounts (+ list_workspaces) to see what's connected → create_posts (one socialMediaId per post; batch up to 15) → attach media via upload_from_url (a public https URL) or upload_media (a ChatGPT-attached/generated image, or base64) → a post publishes when status=SCHEDULED and approvalStatus=APPROVED.

Workspaces: omit workspaceId to use the connection's default; pass a workspaceId (from list_workspaces) to act in another workspace.

${SHARED_TAIL}`;

export const SERVER_INSTRUCTIONS: Record<Binding, string> = {
  stdio: STDIO_INSTRUCTIONS,
  remote: REMOTE_INSTRUCTIONS,
};

export function instructionsFor(binding: Binding): string {
  return SERVER_INSTRUCTIONS[binding];
}
