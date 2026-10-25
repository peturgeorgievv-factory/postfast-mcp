---
name: manage-comments
description: Read and answer comments on the user's social posts through the PostFast inbox, showing every reply or deletion to the user before it happens. Use when someone asks what people are saying under their posts, wants to find comments nobody has answered, reply to comments publicly or with an Instagram private reply, hide, unhide or delete a comment, or sort and assign comment threads on TikTok, Instagram, Facebook or Threads.
---

# Answer comments with PostFast

The PostFast inbox holds comments on the user's own posts on TikTok, Instagram, Facebook Pages and Threads. It is a comments inbox: never describe it as direct messages. Each account's `inboxCapable` flag in `list_accounts` says whether its comments reach the inbox today, and comments arrive only from the time the account was connected; there is no older history.

## Rules

1. **Nothing is sent or deleted without a yes to the exact preview.** Each action has its own preview tool, which sends nothing and returns a preview: `preview_comment_reply` for a public reply, `preview_private_reply` for an Instagram private reply and `preview_comment_deletion` for a deletion. Show the user the preview, wait for their yes in the conversation, and only then call the tool that carries it out: `reply_to_comment`, `send_private_reply` or `delete_comment`. This holds even when the user dictated the reply word for word: they still see the preview and say yes before it is sent. Never preview and carry out in the same turn.
2. **Carry out exactly what was previewed.** Pass the `confirmToken` from the preview with the same `itemId` and `text`, and the same `workspaceId` only if you passed one to the preview. If the user changes the text, preview it again and show the new preview.
3. **The conversation decides whether and how long a reply can be.** Read `canReply`, `maxReplyLength`, `windowState` and `disabledReason` on the conversation and keep to them. Don't assume a network's rules. When `canReply` is false, tell the user why, using `disabledReason`, instead of trying.
4. **If `preview_comment_reply`, `preview_private_reply` or `preview_comment_deletion` is not among your tools,** that action (a public reply, a private reply or a deletion) isn't available on this connection. Tell the user and suggest doing it in PostFast instead. Reading, hiding, restoring and sorting comments still work.

## Find comments to answer

1. If the user has more than one workspace (`list_workspaces`), ask which one and pass its `id` as `workspaceId` on every call.
2. `get_inbox_unread_count` gives the total of unread comments.
3. `list_inbox_conversations` lists threads, newest activity first, one per post. Filter with `unreadOnly`, `statuses` (OPEN, SNOOZED or CLOSED), `platforms` or `socialMediaIds`, and page with `page`.
4. `list_inbox_items` with the conversation's `id` as `conversationId` lists its comments and replies, oldest first (`order: "DESC"` for newest first). Items have `direction` (INBOUND from people, OUTBOUND from the account), `state` (VISIBLE, HIDDEN or DELETED), the author, and the text.
5. A comment is unanswered when it is INBOUND and VISIBLE and no OUTBOUND item replies to it; a reply's `parentExternalItemId` is the `externalItemId` of the comment it answers.
6. Show each comment with its post (the caption, and the link from `postPreview` when there is one), the author, the text and when it was written, and say whether a reply is possible.
7. After you have shown the user a thread, call `mark_inbox_conversation_read` for it.

## Reply

1. Draft a short reply to each comment the user wants answered, in the voice of the account and within `maxReplyLength`. Suggest hiding spam or abuse rather than answering it. Show the drafts as a numbered list so the user can change or drop any of them.
2. For each reply the user keeps, call `preview_comment_reply` with the comment's own `itemId` (the item from `list_inbox_items`, not the conversation) and the `text` exactly as the user kept it, word for word.
3. Show the previews together: for each, whose comment it is and what it says, and the exact reply that will appear under it publicly. For example:

   > **Nothing is sent yet. Reply to these?**
   >
   > 1. **@maria_k** on your 12 Oct Reel: "Is the cafe open on Sundays?"
   >    Your reply: "Yes, from 9:00 to 15:00. See you there!"
   >
   > Reply **yes** to send, or tell me what to change.

4. After the user says yes, call `reply_to_comment` once for each previewed reply, with its `confirmToken`, `itemId` and `text`. A yes can cover every reply in the preview it answers.
5. A `confirmToken` works once and expires 15 minutes after the preview. If it has expired, preview the reply again and show it again.

Replies on Threads can't be removed through PostFast afterwards, so point that out in the preview when a reply goes to Threads.

## Instagram private reply

`preview_private_reply` and then `send_private_reply` send one private reply to an Instagram comment. It arrives in the commenter's direct messages (possibly in their message requests), so say that in the preview. It is possible only when the comment item's `canPrivateReply` is true, once per comment, and within 7 days of the comment. It goes through preview, yes and send like any reply, and it can't be unsent.

## Hide, restore or delete a comment

- **Hide or restore:** `set_inbox_item_state` with `action` HIDE or UNHIDE. Hiding takes the comment out of public view on the network, and it can be undone. Tell the user which comment you are hiding; if hiding was your suggestion, ask first.
- **Delete:** `preview_comment_deletion`, then the preview, the yes and `delete_comment`. Deleting removes the comment from the network for good. Threads doesn't support deleting; offer to hide the comment instead.

## Sort and assign

- `set_inbox_conversation_status` sets a thread to OPEN, SNOOZED or CLOSED.
- `assign_inbox_conversation` gives a thread to a workspace member by `assigneeUserId`, or unassigns it when that is left out. No tool lists members, so use an id the user gives you or one already on a conversation's `assignedToUserId`.
- Both change only PostFast; nothing changes on the network.

## When something fails

Errors come back as `inbox.*` codes, such as `replyTooLong`, `replyNotSupported`, `rateLimited`, `privateReplyAlreadySent`, `privateReplyWindowExpired` or `deleteNotSupported`. Tell the user plainly what happened. When `reply_to_comment`, `send_private_reply` or `delete_comment` says the token doesn't match, preview the action again with the exact values and show the new preview.

If a call says the connection doesn't have permission for the action yet, the user needs to reconnect PostFast and allow it; their app may offer that on its own. Then make the same call again: a `confirmToken` that was refused this way still works until it expires, so the user doesn't need to approve the same preview twice.
