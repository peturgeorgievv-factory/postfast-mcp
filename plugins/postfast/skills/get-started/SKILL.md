---
name: get-started
description: "Set up PostFast in this conversation and check that it works: connect PostFast, pick the workspace, see which social accounts are connected, fix disconnected ones and make a first post. Use when someone is new to PostFast here, asks how to set it up or what it can do, says the PostFast tools are missing or signed out, wants to connect or reconnect a social account, or asks why their posts are not going out."
---

# Get started with PostFast

These steps check the PostFast connection and take the user to their first post. They only read, apart from a connect link the user asks for. Scheduling, comments, repurposing and reports have their own skills: schedule-posts, manage-comments, repurpose-content and performance-report.

## Rules

1. **Read first, change nothing.** Setup uses tools that only read. The one exception is `generate_connect_link`, and only when the user wants a link to connect or reconnect an account.
2. **Report what the tools return.** Don't guess which accounts are connected, and mention the ones that are not.
3. **Keep it short.** Show what the next step needs, then offer it.

## Steps

### 1. Check the connection

Call `list_workspaces`.

- **It answers:** PostFast is connected. Carry on.
- **The PostFast tools are missing, or the call says the user is not signed in or the sign-in expired:** PostFast is not connected in this app yet, or its sign-in lapsed. Ask the user to add or reconnect PostFast in their app's connector or app settings and sign in with their PostFast account. While signing in they choose the workspace this connection uses by default. Then try again.
- **They have no PostFast account:** say that PostFast works with an existing PostFast account and that they need one to use it here. Don't link to sign-up, plans or pricing.

### 2. Pick the workspace

`list_workspaces` shows every workspace this connection can use. With one, carry on. With several, show them by name and ask which to work in, then pass its `id` as `workspaceId` on every call that follows. Leaving `workspaceId` out uses the workspace chosen at sign-in.

### 3. See the connected accounts

Call `list_accounts` and list the accounts by network, with each one's `platformUsername` or `displayName`.

- **CONNECTED** accounts can publish.
- **DISABLED** accounts won't publish until they are reconnected. Give the `disabledReason` and offer a reconnect link: `generate_connect_link` with `platforms` set to that network. Whoever owns the account opens the link and signs in again. Set `sendEmail` only when the user asks you to email the link and gives the address.
- **No accounts:** nothing is connected in this workspace yet. The user connects accounts in the PostFast app (https://app.postfa.st) or sends a link from `generate_connect_link` to whoever owns them.
- `inboxCapable` shows which accounts' comments reach the PostFast inbox.

### 4. Settle the time zone

Ask for the user's time zone once, and use it for every time you show or schedule.

### 5. Offer a first step

In two or three lines, offer what fits the accounts they have:

- Schedule or draft posts. Every post waits for their yes before it publishes.
- Answer comments on Instagram, Facebook, TikTok and Threads, with a preview of every reply first.
- Turn an article or a link into a week of posts.
- Report how their posts and followers did.

If they want to post now, follow the schedule-posts skill.

## When something fails

- **A missing scope or permission:** the connection was allowed less than this needs, or the user's role in the workspace doesn't include it. Ask them to reconnect PostFast and allow everything it asks for, or to ask a workspace admin.
- **`socialMediaDisconnected` when scheduling:** the account needs reconnecting (step 3).
- **`subscription.required`:** the account has no active PostFast plan, so PostFast refuses the call. Say so plainly, and that the account owner can sort out the plan in PostFast. Don't link to pricing, plans or checkout, and don't recommend a plan.
