---
name: repurpose-content
description: Turn an article, blog post, newsletter, video transcript or web page into a series of social posts and schedule them through PostFast. Use when someone shares a link or pasted text and asks for posts about it, a week of posts from it, a launch or campaign sequence across their networks, or captions for each network from one piece of content.
---

# Turn one piece of content into a week of posts

This skill plans and drafts the posts. Creating and scheduling them follows the schedule-posts skill, so they are held until the user approves them.

## Rules

1. **Nothing is created until the user has agreed to the drafts.** Planning and drafting use no PostFast tools that change anything.
2. **Stay true to the source.** Use only facts, numbers, names and quotes that are in it, word for word where it matters. Don't invent statistics, results or testimonials. Quote people only as the source quotes them.
3. **Fit each network.** Before you draft, load the schedule-posts skill and read its platform rules (`../schedule-posts/references/platform-rules.md` from this skill's folder): text limits, required media and how links work on each network.

## Steps

### 1. Read the source

Use what the user pasted or attached, or read the page at the link they gave with your own web tools, if you have them. If you can't open it, ask the user to paste the text. Read all of it before you plan.

### 2. Settle the brief

Ask only for what you can't tell, and propose a default for the rest:

- **Accounts**: `list_accounts` shows what's connected (use `list_workspaces` first if the user has more than one workspace). Only CONNECTED accounts can be scheduled.
- **How many posts, over how long**: by default about five posts over one week.
- **Time zone and times**: the user's time zone, and the times they usually post.
- **Link and call to action**: usually the source's own link, and what readers should do next.
- **Voice**: the account's usual tone, unless the user says otherwise.

### 3. Pull out the material

Note the main point, three to five strong supporting points (a finding, a tip, a number, a quote, an example), who it is for, and the call to action.

### 4. Plan the series

Lay the posts out in a table: day and time, account, angle, and media. Give each post its own angle, such as the announcement, a key takeaway, a surprising number, a quote, a practical tip, a question to the audience, and a recap. Don't repeat an angle on the same account, spread posts to one account over different days, and start with the announcement.

### 5. Draft each post

- Write every post so it stands on its own for someone who hasn't read the source.
- Fit each draft to its network with the platform rules: length, where the link goes, hashtags.
- Networks that require media (see the platform rules) need an image or video for every post. Use media the user gives you, or ask. An image from the source itself can be used only if the user confirms they may use it.
- Show the plan and all the drafts together, and let the user change, drop or add posts. Nothing is created yet.

### 6. Schedule them

When the user is happy with the drafts, follow the schedule-posts skill from its step 4: upload the media, create the posts on hold with `create_posts` and `approvalStatus: "PENDING_APPROVAL"`, show the preview, and call `approve_posts` only after the user says yes to that preview. If nothing changed since the drafts, keep the preview short: each post's account, time and first line, and a note that the texts are the ones agreed.
