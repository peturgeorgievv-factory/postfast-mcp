---
name: social-inbox
description: Read, reply to, moderate, and triage comments on social posts using the PostFast social inbox. Use when the user wants to see new comments, reply to a comment (publicly or with an Instagram private reply), hide or delete a comment, or triage/assign comment conversations on TikTok, Instagram, Facebook, or Threads.
---

# Social Inbox (comments) via PostFast

You have access to PostFast MCP inbox tools — a **comments** inbox for the workspace's own posts. It is never a DM/messages inbox. Covered platforms: TikTok, Instagram, Facebook Pages, Threads, LinkedIn — an account's `inboxCapable` flag (from `list_accounts`) is the authority on what is live today. Not covered: X, YouTube, Pinterest, Bluesky, Telegram, Google Business Profile. Comments appear from connect/launch onward — there is no history backfill.

## The one rule that overrides everything

Reply capability is **server-computed per conversation**: `canReply`, `maxReplyLength`, `windowState`, `disabledReason`. Always read and obey these fields — never assume a platform allows replying or guess a length limit. If `canReply` is false, tell the user why via `disabledReason` instead of attempting the call.

## Reading workflow

1. **Unread check** — `get_inbox_unread_count` for the workspace total.
2. **List conversations** — `list_inbox_conversations` (newest activity first). Filter by `platforms`, `socialMediaIds`, `statuses` (OPEN/SNOOZED/CLOSED), `unreadOnly`, or `assignedToUserId`. Each row carries the capability fields plus `unreadCount` and `status`.
3. **Open a thread** — `list_inbox_items` with the `conversationId` (oldest first; `order: "DESC"` for newest first). Items have `direction` (INBOUND/OUTBOUND), `state` (VISIBLE/HIDDEN/DELETED), author info, and on Instagram comments `canPrivateReply`.
4. **Mark it read** — call `mark_inbox_conversation_read` after presenting a thread to the user.

## Replying

- **Public reply** — `reply_to_inbox_item` with the **comment item's id** (not the conversation id). Respect `maxReplyLength` (platform caps as context: TikTok 1,200, Instagram 2,200, Facebook 8,000, LinkedIn 1,250, Threads 500 — the fields are authoritative). Confirm the reply text with the user before sending; it posts publicly.
- **Instagram private reply** — `send_inbox_private_reply`, only where the item's `canPrivateReply` is true: exactly one per comment, within 7 days of the comment, up to 1,000 bytes (emoji count multi-byte), and it may land in the recipient's Message Requests. A second attempt fails with `inbox.privateReplyAlreadySent`.
- Replies sent through PostFast appear once in the thread — no duplicates when the platform confirms them.

## Moderating & triage

- `set_inbox_item_state` — `HIDE` / `UNHIDE` a comment on the platform; `DELETE` **removes the comment on the platform and cannot be undone** — always confirm with the user first. DELETE is not available on Threads.
- `set_inbox_conversation_status` — OPEN / SNOOZED / CLOSED (internal triage; nothing changes on the platform).
- `assign_inbox_conversation` — hand a conversation to a workspace member (omit `assigneeUserId` to unassign).

## Tips

- Failures come back as `inbox.*` codes (e.g. `replyTooLong`, `replyNotSupported`, `privateReplyWindowExpired`, `rateLimited`) — surface them plainly to the user.
- Two-way sync: hiding/deleting a comment on the platform itself updates the inbox automatically.
- TikTok quirks: commenter names can take about a minute to appear.
- Threads quirks: usernames only (no commenter avatars); replies up to 500 characters; no delete.
- For drafting many replies, read the whole thread first (`list_inbox_items`) so replies land under the right comment items.
