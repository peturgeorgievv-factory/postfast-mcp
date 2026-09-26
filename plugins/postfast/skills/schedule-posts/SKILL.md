---
name: schedule-posts
description: Schedule and publish social media posts through PostFast, with the user's approval before anything goes out. Use when someone wants to post or schedule something on X, Instagram, Facebook, TikTok, LinkedIn, YouTube, Threads, Pinterest, Bluesky, Telegram or Google Business Profile, plan a week of content, save a draft for later, or check, fix or remove posts that are scheduled or failed.
---

# Schedule posts with PostFast

These steps use the PostFast connector's tools. PostFast holds each post you create until the user approves it, so the user sees exactly what will go out, where and when, before anything is published.

## Rules

1. **Create on hold, publish only on a yes.** Create every post with `approvalStatus: "PENDING_APPROVAL"`. Show the user the preview (step 6), and call `approve_posts` only after they say yes to it in the conversation, even when their first message asked you to post right away. A yes covers the posts as previewed; if anything changes, preview again.
2. **Only connected accounts publish.** Check each account's `connectionStatus` in `list_accounts` before you schedule to it.
3. **Fit each network.** Before you write or adapt a post, read `references/platform-rules.md` in this skill's folder: text limits, required media, and the settings each network needs.
4. **Use the user's time zone.** `scheduledAt` is ISO 8601 with a UTC offset. If you don't know the user's time zone, ask once, and show every time back in it.

## Steps

### 1. Pick the workspace

Call `list_workspaces`. With one workspace, carry on and leave `workspaceId` out. With several, use the one the user names or ask which, then pass its `id` as `workspaceId` on every call that follows. Leaving it out uses the workspace the user connected.

### 2. Pick the accounts

Call `list_accounts` and match what the user asked for ("our Instagram", "LinkedIn and X") by `platform`, `platformUsername` and `displayName`. If a network has more than one account, ask which one.

If an account's `connectionStatus` is DISABLED:

- Don't schedule to it; PostFast rejects that. Tell the user, and give the `disabledReason`.
- Offer a reconnect link: `generate_connect_link` with `platforms` set to that network. Whoever owns the account opens the link and signs in again. Set `sendEmail` only when the user asks you to email the link and gives the address.
- Offer to save the post as a draft in the meantime.

### 3. Write the posts

- One post per account: a post for three networks is three posts.
- When the user gives exact text, use it as given. If it's over a network's limit, say so and offer a shorter version rather than cutting it yourself.
- When you write the text, fit it to each network instead of pasting one text everywhere: its length, how hashtags, mentions and links work there, and its tone. Keep names, prices, dates and links exactly as the user gave them.

### 4. Add media

- TikTok, Instagram, Pinterest and YouTube need media, even for a draft. If the user hasn't given any, ask for it before you create anything.
- Media at a public https URL: `upload_from_url` with `sourceUrl`.
- A file in the conversation: `upload_media` with the file's bytes as base64 in `data` and its MIME type in `contentType`. This suits images of a few MB. For a video or a large file, ask for a public https link that downloads the file, and use `upload_from_url`.
- Each upload returns a `media_id`. Pass it as `mediaItems[].key`, with `type` IMAGE or VIDEO to match the file and `sortOrder` from 0. You can use the same `media_id` in several posts.

### 5. Create the posts, held

Call `create_posts` with:

- `posts`: one entry per account, each with `socialMediaId`, `content`, and where needed `mediaItems`, `scheduledAt` and `firstComment`. Up to 15 posts per call.
- `status`: SCHEDULED, with a `scheduledAt` in the future and within a year on every post; or DRAFT, with no `scheduledAt`, to save it in PostFast without a time.
- `approvalStatus`: `"PENDING_APPROVAL"`. The connector holds posts in Claude anyway; passing it keeps the flow the same on every client.
- `controls`: the network settings from the platform rules. They apply to every post in the call, so posts that need different settings go in separate calls.

If the call is rejected, the error names the rule, for example `socialMediaDisconnected`, `contentLength.x` or `platformMedia.instagram.mediaRequired`. Fix that post and create it again. Keep the post ids from the result.

### 6. Show the preview and ask

Show every post as it will go out, then ask for a yes. For example:

> **Nothing is published yet. Shall I schedule these?**
>
> 1. **Instagram @acme**, Tue 14 Oct, 09:00 (Europe/Sofia), feed post with 1 image
>    "Our autumn menu is here…" *(the full text)*
> 2. **LinkedIn Acme Ltd**, Tue 14 Oct, 09:00 (Europe/Sofia), text only
>    "We're launching our autumn menu…" *(the full text)*
>
> Reply **yes** to schedule both, or tell me what to change.

Give the full text, the media, and the settings that change what people see, such as Reel or feed, a Threads topic or a Pinterest board. A draft needs no approval: say it is saved in PostFast and has no time yet.

### 7. Approve after the yes

When the user says yes to the preview, call `approve_posts` with the post ids and `approvalStatus: "APPROVED"`. Then check them with `list_posts` and `ids`: each should be SCHEDULED and APPROVED, and it publishes at its time.

- **Changes:** there is no edit. Delete the held post with `delete_post`, create the new version (step 5), and preview again.
- **No, or no answer:** leave the posts held. They stay in PostFast unpublished, where the user can review them. Delete them only if the user asks.
- **Approved after the time has passed:** the post goes out within about a minute if it is less than 2 hours late. Past 2 hours, create it again with a new time and delete the old one.

## "Post it now"

PostFast has no publish-now. Schedule the post about 5 minutes ahead and say so in the preview. If the yes arrives after that time, the post goes out right after approval (step 7).

## Check, fix or remove posts

- `list_posts` filters by `statuses` (DRAFT, SCHEDULED, PUBLISHED, FAILED), `platforms`, `from` and `to`, or `ids`, up to 50 per page.
- A FAILED post has a `lastError`. MISSED_DISCONNECTED means its account was disconnected when it was due: reconnect the account (step 2), then create the post again. MISSED_NOT_PUBLISHED means it passed its time by more than 2 hours without going out. Other errors are usually media the network refused.
- Each post shows its settings in `controls`. Only the field for the post's own network means anything; the others can hold defaults.
- `delete_post` removes a post from PostFast and stops a scheduled post from going out. It does not remove a post that was already published: that stays on the network until the user deletes it there, so say so. Deleting can't be undone, so confirm first.
