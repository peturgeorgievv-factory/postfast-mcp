# Platform rules for PostFast posts

Check every post against these rules before you create it. They follow what PostFast validates. If a tool description or an error from the PostFast connector says something different, the connector is right: follow it and tell the user what changed.

## Text length

| Network | Limit (characters) |
| --- | --- |
| X | 280. Up to 4,000 only when the user says the account has X Premium |
| Threads | 500 |
| Bluesky | 300 |
| Instagram | 2,200, with at most 30 hashtags |
| TikTok | 4,000 on photo posts, 2,200 when the post has a video |
| LinkedIn | 3,000 |
| Facebook | 63,206 |
| YouTube | Title 100; without a title, the first 100 characters of the text become the title. Description 5,000. No `<` or `>` in either |
| Pinterest | The first line is the pin title, up to 100. The rest is the description, up to 800 |
| Google Business Profile | 1,500 |
| Telegram | 4,096 |

PostFast rejects text over the limit when you create the post (error `contentLength.<network>`; on X it checks the account's own plan). Check the length first, and when a text is too long, tell the user and offer a shorter version, or to split it into separate posts.

Links: on X every link counts as 23 characters, however long it is. Links in Instagram and TikTok captions can't be clicked, so for those, point people to the link in the account's bio, or leave the link out. A pin's destination goes in `pinterestLink`, and a Google Business Profile post can carry a button (see the settings below).

## Media

Media is required on TikTok, Instagram, Pinterest and YouTube (one video), even for a draft. If the user wants to post there and has given you no image or video, ask for one before you create anything. X, LinkedIn, Facebook, Threads, Bluesky, Telegram and Google Business Profile accept text-only posts.

| Network | Media per post |
| --- | --- |
| X | Up to 4 images, or 1 video |
| TikTok | 1 video, or up to 10 images (a photo post) |
| Instagram | Up to 10 items in total, images and videos mixed |
| YouTube | 1 video, no images |
| Facebook | Up to 10 images, or 1 video |
| LinkedIn | Up to 10 images, or 1 video |
| Threads | Up to 10 items in total, images and videos mixed |
| Pinterest | Up to 5 images, or 1 video |
| Google Business Profile | 1 image, no video |
| Bluesky | Up to 10 images, or 1 video |
| Telegram | Up to 10 items in total, at most 3 of them videos |

- Where the table says "or", a post carries images or a video, not both.
- File types: JPEG, PNG, GIF and WebP images; MP4, WebM and MOV videos.
- Set each `mediaItems[].type` to IMAGE or VIDEO to match the uploaded file; a mismatch is rejected. `sortOrder` (from 0) sets the order of a carousel.
- Videos can be up to 250 MB (Telegram 50 MB, Bluesky 100 MB).
- A custom video cover is an uploaded image passed as `coverImageKey`, on Instagram Reels, Facebook Reels, Pinterest video pins and TikTok videos.

## Settings per network

Settings go in `controls`. One `create_posts` call shares its `controls` across every post in it, so put posts that need different settings, such as an Instagram Reel and an Instagram feed post, or two Threads topics, in separate calls.

- **Pinterest**: `pinterestBoardId` is required to schedule (a draft can go without it). It is a board's `boardId` from `list_pinterest_boards`, not the account id. `pinterestLink` sets where the pin leads.
- **Google Business Profile**: `gbpLocationId` is required to schedule (a draft can go without it). It is the `locationId` from `list_gbp_locations`. `gbpTopicType` is STANDARD, EVENT or OFFER; EVENT and OFFER need `gbpEventTitle` (up to 58) and `gbpEventStartDate` / `gbpEventEndDate`. A call-to-action button takes `gbpCallToActionType` (BOOK, ORDER, LEARN_MORE, SIGN_UP, CALL or SHOP) and `gbpCallToActionUrl` (not needed for CALL, ignored on OFFER). Offers can carry `gbpOfferCouponCode`, `gbpOfferRedeemUrl` and `gbpOfferTerms`.
- **YouTube**: `youtubeTitle`, `youtubePrivacy` (PUBLIC, PRIVATE or UNLISTED), `youtubeIsShort` (on by default), `youtubeTags`, `youtubeMadeForKids`, and `youtubePlaylistId`, which is the `playlistId` from `list_youtube_playlists`. A custom thumbnail is an uploaded image passed as `youtubeThumbnailKey` (up to 2 MB, at least 640 pixels wide; 1280x720 works best).
- **Instagram**: `instagramPublishType` is TIMELINE, STORY or REEL. `instagramTrialReelStrategy` (MANUAL or SS_PERFORMANCE) makes a Reel a trial reel shown first to non-followers; it needs REEL and can't be combined with `instagramCollaborators`.
- **Facebook**: `facebookContentType` is POST, REEL or STORY. `facebookTargetCountries` limits who sees a feed post to up to 25 countries (two-letter codes); it doesn't apply to Reels or Stories.
- **TikTok**: `tiktokTitle` titles a photo post (up to 90). A sound from `list_tiktok_sounds` goes in `tiktokMusicSoundId`, with its label in `tiktokMusicSoundName`; it works on photo and video posts, not together with `tiktokAutoAddMusic`, and not on a post sent as a TikTok draft (`tiktokIsDraft`). `tiktokAllowComments`, `tiktokAllowDuet` and `tiktokAllowStitch` switch those features. `tiktokPrivacy` is deprecated: videos use the account's default and photo posts are public.
- **Threads**: `threadsTopicTag` sets the post's topic: one topic, 1 to 50 characters, with no `.` or `&`. It takes precedence over a #hashtag in the text, which then stays plain text.
- **X**: `xRetweetUrl` reposts an existing post; the text and media of the new post are ignored.
- **Place tags**: find the place with `search_places`. Its id works as `facebookPlaceId` (Facebook feed posts only, not Reels, Stories or videos) and as `instagramLocationId` (Instagram posts with a single image or video, not carousels).
- **First comment**: `firstComment` is posted right after the post goes out, on X, Instagram, Facebook, YouTube, Threads and TikTok (up to 1,200 on TikTok).
- **AI-generated media**: set `instagramIsAiGenerated`, `youtubeContainsSyntheticMedia` or `tiktokIsAigc` when the image or video was made with AI. These labels can only be set when the post is created, so ask before you create it.

## Accounts

- Only an account whose `connectionStatus` is CONNECTED publishes. Scheduling to a DISABLED account is rejected; a draft is still allowed.
- The board, playlist and location lists take the account's `socialMediaId`. Pass the network's own id from the result (`boardId`, `playlistId` or `locationId`) in `controls`, never the item's internal `id`.
