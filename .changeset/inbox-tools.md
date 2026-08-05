---
"postfast-mcp": minor
---

Add the 10 social-inbox tools to the catalog (comments on TikTok Business / Instagram / Facebook Pages / Threads posts): list/get conversations, list items, unread count, public reply, Instagram private reply, hide/unhide/delete moderation, mark-read, status triage, and assignment — all `binding: 'both'`, with descriptions steering models to the server-computed reply capability (canReply / maxReplyLength / windowState / disabledReason). The stdio bin implements them over `/social-inbox/*`. The 10 new `BackendPort` methods are optional and the registrar skips (with a log) any tool whose port method is absent, so hosts on an older adapter deploy cleanly and pick the tools up when their adapter catches up. The release workflow now notifies social-schedule-mcp (`catalog-release` repository_dispatch) after a successful publish.
