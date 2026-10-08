import type { Binding } from './tool-def.js';

/**
 * Server `instructions` sent at MCP `initialize` — standing guidance the client
 * model reads before calling tools. Grounded in the PostFast docs + the
 * backend's actual create-posts validation, so it matches what the API
 * enforces (prevents the model discovering rules by failing).
 *
 * The two bindings share most paragraphs. They differ where their tool
 * surfaces differ (workspace switching and conversation-media/URL uploads on
 * the remote host, local files on stdio) and in how posts and comment replies
 * go out: on the remote binding every post is held until approve_posts, and
 * replies and comment deletions go through prepare_inbox_action and
 * confirm_inbox_action, each only after the user says yes.
 */

const INTRO = `PostFast schedules and publishes social posts across X, Instagram, Facebook, TikTok, LinkedIn, YouTube, Threads, Pinterest, Bluesky, Telegram, and Google Business Profile.`;

const CONNECTED = `Before scheduling, confirm the target account's connectionStatus is CONNECTED. A DISABLED account will not publish (disconnected accounts are the #1 cause of failed posts) — saving a DRAFT is still allowed.`;

const MEDIA = `Media: use the key returned by an upload tool, and set mediaItems[].type to match the file (IMAGE for image/* keys, VIDEO for video/* keys — a mismatch is rejected). Videos are capped at 250MB (Telegram 50MB, Bluesky 100MB). Media is REQUIRED on TikTok, YouTube (video only), Instagram, and Pinterest; X, LinkedIn, Facebook, Threads, Bluesky, Telegram, and Google Business Profile allow text-only posts (GBP accepts 1 image and no video). This requirement applies even to DRAFTS — a draft to a media-required platform without media is rejected. So if the user asks to post to a media-required platform and provides no media, ask them for an image/video (or generate and upload one) BEFORE calling create_posts; don't attempt the post without media.`;

const LIMITS = `Per-platform limits (media counts / characters):
- X: up to 4 images or 1 video (no mixing); 280 chars (4,000 with X Premium).
- TikTok: 1 video OR up to 10 images; 4,000 chars.
- Instagram: up to 10 media items, images and videos mixed; 2,200 chars, max 30 hashtags.
- YouTube: 1 video, no images; title max 100 chars.
- Facebook / LinkedIn: up to 10 images OR 1 video (no mixing).
- Threads: up to 10 media items, images and videos mixed; 500 chars.
- Pinterest: up to 5 images or 1 video; title max 100, description max 800.
- Google Business Profile: text only, or 1 image and no video; 1,500 chars.
- Bluesky: up to 10 images or 1 video. Telegram: up to 10 media items, at most 3 of them videos.
No post carries more than 10 media items.
If content exceeds the target platform's character limit, don't schedule it as-is — tell the user and offer to shorten or split it (X is 280 unless the account has X Premium = 4,000).`;

const CONTROLS = `Platform-specific options go in the controls object, e.g.:
- Pinterest: controls.pinterestBoardId is REQUIRED — it is a board's boardId from list_pinterest_boards, NOT the Pinterest account's socialMediaId.
- Google Business Profile: controls.gbpLocationId is required — the locationId from list_gbp_locations.
- YouTube: controls.youtubePlaylistId is the playlistId from list_youtube_playlists; youtubeIsShort defaults true; title falls back to the first 100 chars of content; youtubeLanguage sets the video's language (BCP-47, e.g. en-GB) and youtubeCaptionKey adds an uploaded .srt/.vtt caption file in that language (never in mediaItems).
- TikTok: controls.tiktokPrivacy is deprecated (videos use the account default, photos default to public); tiktokTitle applies to photo carousels only (max 90); firstComment (max 1,200).
- Instagram: controls.instagramPublishType = TIMELINE | STORY | REEL.
- Facebook: controls.facebookContentType = POST | REEL | STORY. controls.facebookTargetCountries limits who can see a FEED post by country (ISO 3166-1 alpha-2, max 25; not Reels/Stories).
- Geotag a place (Facebook/Instagram): call search_places, then pass a returned id as controls.facebookPlaceId (Facebook feed posts only — not Reels/Stories/video) and/or controls.instagramLocationId (Instagram single media only — not carousels). One id works for both.
- LinkedIn: attach a document via controls.linkedinAttachmentKey.
- X: controls.xRetweetUrl reposts an existing tweet (content/media are ignored).
Note: list_pinterest_boards / list_youtube_playlists / list_gbp_locations take the account's socialMediaId; each returned item has BOTH an internal id and the platform id (boardId / playlistId / locationId) — pass the PLATFORM id to controls, not the internal id or the account id.`;

const FAILED = `Failed posts carry lastError — usually a disconnected account (reconnect, then retry) or platform-rejected media.`;

const DELETE_POST = `delete_post (one post) and delete_posts (up to 100 in one call) remove posts from PostFast only — they never delete an already-published post from the social platform. Say so when a user asks to delete something that has already gone out.`;

const REMOTE_DELETE_POST = `${DELETE_POST} Deleting can't be undone, so show the user which posts (account, time, first line) and call delete_post or delete_posts only after they say yes in the conversation.`;

const STDIO_INSTRUCTIONS = [
  INTRO,
  `Flow: list_accounts to see what's connected → create_posts (one socialMediaId per post; batch up to 15) → attach media via upload_media (a local file, by absolute path) or get_upload_urls (signed PUT upload for raw bytes) → a post publishes when status=SCHEDULED and approvalStatus=APPROVED.`,
  `The POSTFAST_API_KEY is workspace-scoped — every tool acts in that workspace.`,
  CONNECTED,
  `Status & timing: status=SCHEDULED requires scheduledAt on every post (ISO-8601, in the future, within 1 year); status=DRAFT must omit scheduledAt. approvalStatus=APPROVED publishes; PENDING_APPROVAL holds it for review. There is no instant "publish now" — for an immediate post, set scheduledAt a few minutes ahead of now (a time at or before the current moment is rejected).`,
  MEDIA,
  LIMITS,
  CONTROLS,
  FAILED,
  DELETE_POST,
  `Social inbox (comments on your posts — TikTok, Instagram, Facebook Pages, Threads; an account's inboxCapable flag from list_accounts says what is live today): read with list_inbox_conversations → list_inbox_items (get_inbox_unread_count for the total), reply with reply_to_inbox_item (public, under a specific comment item) or send_inbox_private_reply (Instagram only: one per comment, within 7 days). Whether and how long a reply can be comes ONLY from the conversation's server-computed canReply / maxReplyLength / windowState / disabledReason — never assume platform rules. Moderate with set_inbox_item_state (HIDE / UNHIDE / DELETE — DELETE removes the comment on the platform and cannot be undone), triage with set_inbox_conversation_status and assign_inbox_conversation, and call mark_inbox_conversation_read after presenting a thread. It is a comments inbox — never present it as DMs or messages.`,
].join('\n\n');

const REMOTE_INSTRUCTIONS = [
  INTRO,
  `Flow: list_accounts (+ list_workspaces) to see what's connected → create_posts (one socialMediaId per post; batch up to 15) → attach media via upload_from_url (a public https URL) or upload_media (base64 bytes in data + contentType). Posts are held for approval and nothing publishes until approve_posts sets them to APPROVED: show the user what will be posted, where and when, and call approve_posts only after they say yes, even if they asked you to post it.`,
  `Workspaces: omit workspaceId to use the connection's default; pass a workspaceId (from list_workspaces) to act in another workspace.`,
  CONNECTED,
  `Status & timing: status=SCHEDULED requires scheduledAt on every post (ISO-8601, in the future, within 1 year); status=DRAFT must omit scheduledAt. Every post is created as PENDING_APPROVAL and publishes at its scheduledAt only once approve_posts sets it to APPROVED.`,
  MEDIA,
  LIMITS,
  CONTROLS,
  FAILED,
  REMOTE_DELETE_POST,
  `Social inbox (comments on your posts: TikTok, Instagram, Facebook Pages, Threads; an account's inboxCapable flag from list_accounts says what is live today): read with list_inbox_conversations → list_inbox_items (get_inbox_unread_count for the total). To reply publicly under a comment (REPLY), send an Instagram private reply (PRIVATE_REPLY: one per comment, within 7 days) or delete a comment permanently (DELETE), call prepare_inbox_action, show the user the preview, and carry it out with confirm_inbox_action only after they say yes, even if they gave you the text. Whether and how long a reply can be comes ONLY from the conversation's server-computed canReply / maxReplyLength / windowState / disabledReason; never assume platform rules. Hide or restore a comment with set_inbox_item_state (HIDE / UNHIDE), triage with set_inbox_conversation_status and assign_inbox_conversation, and call mark_inbox_conversation_read after presenting a thread. It is a comments inbox; never present it as DMs or messages.`,
].join('\n\n');

export const SERVER_INSTRUCTIONS: Record<Binding, string> = {
  stdio: STDIO_INSTRUCTIONS,
  remote: REMOTE_INSTRUCTIONS,
};

/**
 * The server instructions for a binding. The remote text is always the one
 * that holds posts and replies for the user's yes; `opts` is accepted for
 * hosts written against 0.8 and earlier, and ignored.
 */
export function instructionsFor(binding: Binding, _opts?: { gated?: boolean }): string {
  return SERVER_INSTRUCTIONS[binding];
}
