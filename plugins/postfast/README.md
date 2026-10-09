# PostFast for Claude

Plan, schedule and approve social media posts, answer comments, and review how your posts perform, all from a conversation with Claude. PostFast publishes to X, Instagram, Facebook, TikTok, LinkedIn, YouTube, Threads, Pinterest, Bluesky, Telegram and Google Business Profile.

Nothing goes out without your say-so. Claude creates every post in PostFast on hold, shows you exactly what will be published, where and when, and approves it only after you say yes. Comment replies and deletions work the same way: you see each one before it is sent.

## What's inside

| Skill | What Claude does with it |
| --- | --- |
| `get-started` | Checks that PostFast is connected, helps you pick the workspace, lists your social accounts and offers reconnect links for any that stopped working, then suggests a first step. |
| `schedule-posts` | Checks which accounts are connected, writes each post to fit its network, creates it on hold, shows you the preview, and schedules it after your yes. Also saves drafts and explains failed posts. |
| `manage-comments` | Finds comments nobody has answered on TikTok, Instagram, Facebook and Threads, drafts replies, and sends each one only after you have seen it and agreed. Hides, restores and deletes comments the same way. |
| `repurpose-content` | Turns an article, newsletter, transcript or web page into a week of posts for your networks, then schedules them with your approval. |
| `performance-report` | Summarizes reach, engagement and follower growth per network for a period, with your best and weakest posts and what to post more of. |

The plugin uses the PostFast connector, the same one listed in the Claude directory at [claude.ai/directory/postfast](https://claude.ai/directory/postfast). If you have connected PostFast already, the plugin uses that connection and you see one set of PostFast tools.

## Get started

1. You need a [PostFast](https://postfa.st) account with at least one social account connected.
2. Add the plugin, then connect PostFast:
   - **Claude on the web, desktop and mobile, and Cowork**: open the plugin's **Connectors** tab and connect PostFast. You sign in with your PostFast account, pick the workspace Claude should use by default, and allow access; no API key is needed.
   - **Claude Code**: run `/mcp`, select PostFast and sign in the same way. Claude Code keeps its own sign-in. The plugin and the claude.ai PostFast connector share one server, so `/mcp` may list it under either name.
3. Ask Claude, for example:
   - "Schedule a post for our Instagram and LinkedIn tomorrow at 9am about the autumn menu, with this photo."
   - "Which comments on my posts haven't been answered yet? Draft replies."
   - "Turn this blog post into a week of posts for X, LinkedIn and Threads."
   - "How did our posts do last week?"

## Data and privacy

- The plugin is instructions plus a reference to one connector: PostFast, at `https://mcp.postfa.st/mcp`. It runs no code of its own and stores nothing.
- Claude reads your PostFast workspaces, connected accounts, posts, comments and analytics through the connector.
- Claude sends PostFast what you ask it to act on: post text, media, times, target accounts and network settings; comment replies and moderation you approve; and approvals of posts you confirm. PostFast then publishes to the networks you connected.
- When you give Claude a link to an image, a video, a caption file or a document, PostFast's server downloads the file from that link. When you ask for an account reconnect link to be emailed, PostFast sends that email.
- When you ask Claude to repurpose a web page, Claude reads it with its own tools. The plugin sends it nowhere else.
- Sign-in is OAuth with your PostFast account. Read PostFast's [privacy policy](https://postfa.st/privacy).

## Good to know

- Posts you haven't approved stay in PostFast, unpublished, where you can review them.
- In Claude Code, only one plugin named `postfast` loads at a time. If you installed PostFast's API-key plugin from the `postfast-mcp` marketplace, Claude Code keeps that one; remove it to use this one.
- Help: [help.postfa.st](https://help.postfa.st).

## License

MIT
