---
name: performance-report
description: Summarize how the user's social media is performing from PostFast analytics, with reach, engagement and follower growth per network, the best and weakest posts, and what to post more of. Use when someone asks how their posts did last week or last month, which posts worked best, how their follower count changed, or wants a performance report for a client, a manager or their team.
---

# Report social media performance with PostFast

This skill only reads. It never creates, approves or deletes anything.

## Steps

### 1. Set the scope

- **Workspace**: if `list_workspaces` shows more than one, ask which, and pass its `id` as `workspaceId` on every call.
- **Period**: use the period the user names. "Last week" means the previous Monday to Sunday in the user's time zone; with no period given, use the last 7 full days. State the dates you used. For a trend, also fetch the period of the same length just before it.
- **Accounts**: `list_accounts` gives each account's `platform`, `platformUsername` and current `followerCount`.

### 2. Fetch the numbers

- **Posts**: `get_post_analytics` with `startDate` and `endDate` (ISO 8601), and `platforms` or `socialMediaIds` to narrow it. It returns published posts with their `latestMetric` (impressions, reach, likes, comments, shares, total interactions) and network-specific `extras`; videos add views and watch time, and Instagram adds `saveRate`, and `reelsSkipRate` on Reels. There is no paging, so ask for a month at most at a time.
- **Followers**: `get_follower_history` for each account, with `from` and `to`. It returns `currentFollowerCount`, the change over the period (`delta`) and daily points. Tracking starts when PostFast first recorded the account (`trackingStartedAt`), so there is nothing before that date.
- **What went out**: optionally, `list_posts` with `statuses` PUBLISHED and FAILED and the same `from` and `to`, to count the posts published and the ones that failed.

Numbers come back as strings: convert them before you add or compare them. A post whose `latestMetric` is null has no metrics yet; count it but leave it out of averages.

### 3. Know the coverage

- Post analytics cover Instagram, Facebook, TikTok, Threads, YouTube, LinkedIn company pages and Pinterest business accounts. X, Bluesky, Telegram, Google Business Profile and LinkedIn personal profiles have no post analytics here; say so instead of reporting zeros.
- Follower history covers Facebook Pages, Instagram, YouTube, Pinterest, Threads, Bluesky, Telegram, LinkedIn company pages and TikTok, not X or personal Facebook profiles.

### 4. Write the report

1. **Summary**: two or three sentences on the period: posts published, total reach, engagement, and follower change.
2. **By network**: a table with posts, impressions, reach, interactions, engagement rate and follower change for each account. Engagement rate is interactions divided by reach; when reach is missing, use impressions and say so. Networks count impressions differently, so compare each network with its own earlier period rather than with the others.
3. **Best posts**: the top three by engagement rate, each with its account, date, the first line of its text, its numbers, and a short guess at why it worked, worded as a guess.
4. **Weakest posts**: the bottom one or two, with the same details.
5. **Next**: two or three concrete suggestions drawn from the data, such as the formats, topics, days or times that did best.

Keep every number traceable to the data you fetched, and don't state causes as facts. If the user wants to act on the suggestions, the schedule-posts skill can plan and schedule the next posts.
