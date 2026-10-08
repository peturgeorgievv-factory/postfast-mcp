# postfast-mcp

## 0.12.1

### Patch Changes

- Stdio errors now carry the API's reason. The API answers many errors with a code in `message` and the explanation in `description`, and the stdio server showed only the code: a model saw `media.invalidMedia` without "(not a timed UTF-8 SRT or WebVTT file)", or `youtubeLanguage.invalid` without the suggested codes. The description now follows the code ("PostFast API error (400): media.invalidMedia — Invalid media files: …"), and a 429 still ends with the Retry-After hint. The lockfile moves proxy-addr to 2.0.8 (GHSA-jqcg-44mw-7w3h), so the `.mcpb` bundle ships the fixed version; the stdio server never loads it. No tool, schema or instruction changes.

## 0.12.0

### Minor Changes

- YouTube video language and caption files:

  - `create_posts` gains two YouTube controls, which its schema used to drop. `youtubeLanguage` is the video's language as a BCP-47 code (`en`, `en-GB`, `es-419`, `pt-BR`, `zh-Hans`, …). It sets YouTube's Video language and its Title and description language, and an unknown code is rejected. `youtubeCaptionKey` is the key of an uploaded `.srt` or `.vtt` file, added after the upload as the video's caption track in that language. It requires `youtubeLanguage` and gives one track per post; the file must be timed SRT or WebVTT, UTF-8, at most 10 MB. If adding the captions fails, the video still publishes. Both descriptions say that controls apply to every post in a call, so videos in different languages need separate calls.
  - The upload tools take caption files (`application/x-subrip` for `.srt`, `text/vtt` for `.vtt`) and say that a `CAPTION` result goes in `controls.youtubeCaptionKey`, never in `mediaItems`. `upload_from_url` adds that a caption link must point to the file itself, since a share page doesn't work. The stdio `upload_media` maps local `.srt` and `.vtt` files to those types and returns type `CAPTION`; `get_upload_urls` takes them with a count of 1.
  - The server instructions' YouTube line names both controls.
  - `postfast-mcp/core` exports `CAPTION_MIME_TYPES`, `uploadTypeFor()` and the `UploadType` type, and `LocalUploadResult.type` can be `CAPTION`. On the remote binding, caption uploads work once the host's `uploadMedia` and `uploadFromUrl` accept the two caption types and return `CAPTION` for them.

## 0.11.1

### Patch Changes

- Dependency refresh, with no change to any tool, schema or instruction. The lockfile moves the MCP SDK's transitive dependencies to patched versions (fast-uri 3.1.8, ip-address 10.7.3, hono 4.13.13, @hono/node-server 1.19.17, qs 6.16.0, body-parser 2.3.0), so the `.mcpb` bundle, which is built from the lockfile, ships them. Fresh npm installs already resolve these within the existing version ranges. The js-yaml dev dependency moves to 4.3.2.

## 0.11.0

### Minor Changes

- `list_posts` gains a `socialMediaIds` filter: only posts on these accounts (ids from `list_accounts`, max 100), AND-ed with the other filters. A new `delete_posts` tool deletes up to 100 posts in one call and returns `{ deletedIds, notFoundIds }`, where `notFoundIds` are the ids that don't exist in the workspace. Like `delete_post`, it removes posts from PostFast only, never from the social platform, and on the remote binding it waits for the user's yes. The server instructions' paragraph on deleting covers both tools. `delete_posts` is registered after the confirm tools, so the existing tools on every surface keep their positions. Its `BackendPort.deletePosts()` method is optional: a host whose adapter does not implement it yet skips the tool, with a log line, and keeps deploying. The stdio adapter calls `POST /social-posts/bulk-delete`, and its error for an HTTP 429 now ends with the API's `Retry-After` delay ("Retry after 37s.").

## 0.10.1

### Patch Changes

- cf4b48d: `generate_connect_link`: the `redirectUrl` description now says the return URL also carries `accountIds` (comma-separated) after a Facebook or LinkedIn page step, and that for Facebook `accountId` is the first chosen Page.

## 0.10.0

### Minor Changes

- Calendar app: a workspace switcher, a searchable account filter, and a reload when you come back. The calendar payload gains `workspaces`: the connection's workspaces, personal first, then by name, with the one on screen always included. It loads alongside the calendar, is given up after 5 seconds, and is empty when unavailable, so it never blocks or breaks the calendar. The view names the workspace in the messages it sends to the conversation (New post, Review in chat), so posts are made in the workspace on screen, and the "Connect an account" link carries it too. Coming back to a calendar more than a minute old reloads it. No tool definitions change.

## 0.9.0

### Minor Changes

- Adds an opt-in calendar app for remote hosts (`BuildToolsOptions.app`): a view (an MCP App, one self-contained HTML file) with posts from the last 2 days through the next 14 and undated drafts, opened by two new entrypoint tools (`open_postfast`, `postfast_tab`), plus `get_calendar_post` (a post in full: text, first comment, every media item) and `record_app_action` (the view's analytics). All four are hidden from the model and appear only when the host passes `app`; without it every surface, stdio included, is unchanged. The view never approves, publishes or deletes: those actions go back to the conversation.
- The remote binding now has a single surface: every post is created held for approval and publishes only through `approve_posts`, and comment replies, private replies and deletions go through `prepare_inbox_action` and `confirm_inbox_action`, each after the user's yes. The ungated remote descriptions, input schemas, annotations and server instructions are removed, and `reply_to_inbox_item` and `send_inbox_private_reply` are stdio-only. Hosts pass `confirmGate` to enable the two confirm tools; without it they are left out and a log line says so. `instructionsFor()` ignores its former `gated` option. `ToolDef` renames `gatedAnnotations` to `remoteAnnotations` and `gatedOnly` to `needsConfirmSecret`, and drops `hiddenWhenGated`. For a host that passed `confirmGate`, this change alone leaves the remote output unchanged; the wording changes are listed under Patch Changes. The stdio surface is unchanged.

### Patch Changes

- The `.mcpb` bundle no longer includes the MCP Registry publisher binary that the release job downloads into the checkout before packing, which cuts the download from about 9.7 MB to about 2.4 MB. The view's HTML entry file stays out of the bundle as well.
- Remote binding: four more tools wait for the user. `delete_post` (and the server instructions' paragraph on it) shows which post and deletes only after the user says yes. `approve_posts` no longer approves a post more than 2 hours past its time; it tells the user and re-creates the post only if they agree. `generate_connect_link` emails the link only when the user asks and gives the address, and its `sendEmail` field says so too. `set_inbox_item_state` hides or unhides a comment only when the user asks. The stdio surface is unchanged.
- Remote binding: `upload_media` now tells the model to pass a file the user attached or generated in the conversation as `file` when the app passes files to tools, then base64 bytes, and to ask for a public link only when it can do neither. Apps that attach files to tool calls no longer fall back to asking the user for a link.

## 0.8.3

### Patch Changes

- Bluesky posts can carry up to 10 images (was 4), or 1 video, never both. The server instructions and the directory plugin's platform rules state the new limit.

## 0.8.2

### Patch Changes

- Media wording now matches the backend's validation, on both bindings:

  - `create_posts` no longer lists Google Business Profile among the platforms that require media. TikTok, Instagram, YouTube and Pinterest still do, drafts included. Google Business Profile accepts text-only posts, or one image and no video, and the server instructions' Google Business Profile line says the same.
  - The server instructions gave Instagram and Threads "up to 10 images + 10 videos" and Telegram "10 images + 3 videos". A post carries at most 10 media items, so they now read "up to 10 media items, images and videos mixed" and "up to 10 media items, at most 3 of them videos". `create_posts` states the 10-item cap too.
  - The social-media-post skill's Google Business Profile media line now says media is optional, at most one image and no video.

  Wording only: fields, limits, validation and errors are unchanged. A new test checks that `create_posts` and the instructions name the same media-required platforms on every surface, and that no stated count exceeds 10 items per post.

- The repository is now also a Cursor plugin. `.cursor-plugin/plugin.json` packages the stdio server, pinned to this release like the Claude Code plugin, together with the two skills. It declares `POSTFAST_API_KEY` as a plugin variable, which Cursor asks for at install, and it carries a logo (`assets/logo.png`). `npm run version` stamps its version and launcher pin along with the other manifests. The README gains an "Install in Cursor" section. The MCP server and its tools are unchanged, and the new files stay out of the npm package and the `.mcpb`.

## 0.8.1

### Patch Changes

- The `threadsTopicTag` description now says that the topic takes precedence over a #hashtag in the post content, which then stays plain text; this was checked on live Threads posts. The README and the social-media-post skill match. Wording only: the field, its limits and its errors are unchanged, on both bindings.

## 0.8.0

### Minor Changes

- Threads topic on `create_posts`, and post settings in `list_posts` results.

  `controls.threadsTopicTag` (optional string, 1-50 characters) sets a Threads post's topic: one topic, not a list, with no `.` or `&`. Only Threads posts use it; other platforms ignore it. Like every key in `controls` it applies to every post in the call, so Threads posts with different topics go in separate calls, and the `create_posts` description now says so. On a Threads post, a topic that breaks these rules is rejected with HTTP 400 `threadsTopicTag.invalid`. The schema checks only the length; the character rule stays with the backend.

  The `list_posts` description now covers the `controls` object on each returned post: `threadsTopicTag`, `instagramPublishType`, `facebookContentType`, `tiktokIsDraft` and `youtubePrivacy`, each null when unset. Only the field for the post's own platform is meaningful, because posts created through the API store every platform's defaults. The exported types follow: `PostControls` gains `threadsTopicTag`, and `SocialPost` gains `controls` (`ReadablePostControls`). The README and the social-media-post skill match. Both bindings.

## 0.7.2

### Patch Changes

- Claude Code plugin: pass POSTFAST_API_KEY through from the environment, pin the MCP launcher to this release; fix the plugin install docs.

  The plugin manifest set `POSTFAST_API_KEY` to an empty string, which replaced a key exported in the shell or set under `env` in `~/.claude/settings.json`, so the server exited at startup. It now passes `${POSTFAST_API_KEY}` through, and its description says where to generate the key.

  The plugin's MCP launcher is pinned to this release (`npx -y postfast-mcp@0.7.2`) instead of whatever the registry serves at session start, and `npm run version` keeps the pin in step with package.json. The repository root no longer carries a `.mcp.json`: it launched the published package with a placeholder key, and a plugin installed from the repository copied it along.

  The README's Claude Code section installs the plugin from this repository's marketplace, puts the key in `~/.claude/settings.json` (a user-level `settings.local.json` is not read), and replaces the `~/.claude/.mcp.json` path, which Claude Code does not read, with `claude mcp add --scope user`. The MCP server and its tools are unchanged.

## 0.7.1

### Patch Changes

- Confirm gate wording: prepare_inbox_action, confirm_inbox_action, approve_posts and the gated server instructions now tell the model to show the user what will happen and wait for a yes in the conversation before confirming or approving, even when the request already included the text. Gated surface only; the default output is unchanged.

## 0.7.0

### Minor Changes

- Opt-in confirmGate for the remote binding: posts held for approval, comment replies, private replies and deletions via prepare_inbox_action and confirm_inbox_action, and client-agnostic upload copy. Default output is unchanged.

## 0.6.2

### Patch Changes

- TikTok sound selection now covers video posts. `tiktokMusicSoundId` and `list_tiktok_sounds` describe sounds for photo, carousel and video posts, and say how a video is mixed: the track plays at 50% volume over the video's original audio at 50%, the TikTok app's defaults, with no volume or trim controls. `tiktokAutoAddMusic` gains a description: TikTok adds a recommended sound on photo/carousel posts only, the field is ignored on videos, and it is mutually exclusive with `tiktokMusicSoundId`. `coverImageKey` now lists TikTok videos among the video posts that take a custom cover. The README and the social-media-post skill match.

  The TikTok `firstComment` note is plain "TikTok" again: the connection-type qualifier that came back in 0.5.2 is removed from the `firstComment` description, the server instructions and the social-media-post skill, as in 0.4.1.

  Wording only: field names, types, limits and errors are unchanged, on both bindings.

## 0.6.1

### Patch Changes

- Every tool now carries its display name in `annotations.title` as well as the top-level `title`. Both fields are filled from the single `title` authored on the tool definition, so they cannot drift. Nothing else about the surface changes: descriptions, input schemas and all four behaviour hints are byte-identical to the previous release.

  The top-level `title` has been present since the catalog was extracted, and per the spec it is what a client should display first — so this is not a fix to what well-behaved clients show. It matters for consumers that read only the annotation: the MCP `ToolAnnotations` object has carried an optional `title` since it was introduced, and directory validators check for it there, reporting a tool as missing a title when the field is absent even though the top-level one is set. Filling both satisfies readers of either field.

  The catalog's `ToolAnnotations` type still declares only the four hints, so a title cannot be authored twice; the resolved shape emitted by `buildTools()` is typed separately as `ResolvedToolAnnotations`, which includes it.

## 0.6.0

### Minor Changes

- 6bd80b4: `generate_connect_link` gains the three optional fields the backend now accepts, so a connect link can be scoped and can return the user to your own app: `platforms` (restrict the link to specific platforms — enforced server-side on every path the link can reach, so a scoped link cannot connect anything else), `redirectUrl` (where the connect page offers to send the user once connecting finishes; https, with http allowed only on loopback) and `externalId` (your own reference, echoed back unchanged, max 128 chars). On success the user returns with `status`, `platform`, `accountId` and `externalId` on the query string — `accountId` is the same `id` `list_accounts` returns, so it is the completion signal. The schema keeps only the max-lengths; the URL-scheme and charset rules stay with the backend, which rejects violations with a clear 400 rather than being restated here where they could drift. The tool description now mentions the capability, since that is the only place a model can discover it. The stdio adapter sends the new keys (its request body is an explicit whitelist, so they were being dropped).

## 0.5.3

### Patch Changes

- Remove outputSchema from every tool. The MCP SDK renders zod output schemas as JSON Schema draft-07 (its converter is never given a dialect target), and clients whose validator accepts only the 2020-12 dialect reject a tool carrying such a schema at list time — before any call, on both bindings. outputSchema is optional in MCP and tool results are unchanged: the JSON text block and structuredContent stay exactly as they were (without a declared schema, structuredContent is never validated or stripped). The parity gate now fails if outputSchema ever reappears.

## 0.5.2

### Patch Changes

- Descriptions only — remove claims we cannot serve today. No code, annotation or
  schema changes.

  LinkedIn inbox is still in LinkedIn app review, so 0.5.1's affirmative LinkedIn
  support claims were wrong. Removed from `list_inbox_conversations`, the inbox
  file header, the server instructions, the README and the social-inbox skill;
  the LinkedIn 1,250-character reply cap is gone from `reply_to_inbox_item`, and
  `set_inbox_item_state` no longer mentions LinkedIn hide support. Coverage is
  TikTok, Instagram, Facebook Pages and Threads. The `inboxCapable` deferral
  stays, so LinkedIn starts working on its own when review clears — no release
  needed.

  Also corrected, found while sweeping every description for claims the backend
  does not actually enforce:

  - `get_inbox_conversation` no longer promises a `postPreview` thumbnail. The
    remote host stopped forwarding the presigned media URL in 0.5.1;
    `list_inbox_conversations` was updated then and this one was missed.
  - TikTok `firstComment` cap is 1,200, not 150 (the same 2026-08-07 raise as the
    inbox reply cap), and the real gate is a TikTok Business API connection.
  - Google Business Profile does not require media. It rejects video and more
    than one image, but a text-only GBP post is valid; the instructions listed it
    as media-required, which would make a model demand an image it does not need.
  - Facebook and LinkedIn reject mixed image+video posts, so their limit reads
    "10 images OR 1 video (no mixing)" rather than "+", which matched the wording
    used for the platforms that do allow mixing.

## 0.5.1

### Patch Changes

- Correct ten tool annotations so every hint matches real behaviour, and fix the
  descriptions that had drifted from the backend.

  Annotations (derived from the gateway/backend code paths, not from tool names):

  - `destructiveHint` false -> true on `create_posts`, `approve_posts`,
    `generate_connect_link`, `reply_to_inbox_item`, `send_inbox_private_reply` —
    each can cause something that cannot be undone through the PostFast API
    (a public post, a sent email, a public comment on a platform with no delete
    verb, a direct message with no unsend).
  - `openWorldHint` true -> false on `delete_post`, `get_post_analytics`,
    `list_pinterest_boards`, `list_youtube_playlists`, `list_gbp_locations` —
    these read or write data PostFast already stores and make no live platform
    call.

  The rule, applied uniformly: `openWorldHint` is true when a tool calls an
  external platform live or causes content to be published/sent outside PostFast;
  `destructiveHint` is true wherever the action cannot be undone through our API.

  Descriptions:

  - `delete_post` now states that it removes the post from PostFast and does NOT
    delete an already-published post from the platform.
  - Inbox reply caps corrected (TikTok is 1,200, not 150) and LinkedIn added.
  - Inbox coverage now names LinkedIn and defers to each account's `inboxCapable`
    flag instead of asserting a fixed platform list.
  - `set_inbox_item_state` now states that HIDE/UNHIDE are unsupported on
    LinkedIn and DELETE is unsupported on Threads.
  - `list_inbox_conversations` no longer advertises a `postPreview` thumbnail: the
    remote host stops returning the presigned media URL.

## 0.5.0

### Minor Changes

- AI-content disclosure controls on `create_posts`: `instagramIsAiGenerated` (adds Instagram's "AI info" label — images, reels, stories and carousels; labels the whole carousel, not individual slides) and `youtubeContainsSyntheticMedia` (altered/synthetic content disclosure, sent to YouTube only when true). Both are optional booleans on the top-level `controls` object, default false, set at creation only — neither can be changed after publishing. The backend has accepted both since social-schedule-service 3353104; they were simply undiscoverable without a description.

  `tiktokIsAigc`'s description now cross-references the other two and says it covers photo posts as well as videos (it always did). The exported `PostControls` type also picks up `tiktokMusicSoundId`/`tiktokMusicSoundName`, which the 0.4.0 sound-selection release added to the schema but not the type.

  Also describes `instagramTrialReelStrategy` (MANUAL | SS_PERFORMANCE) — publishes a trial reel, visible only to non-followers until it graduates, either by hand in the Instagram app or automatically on performance. The description carries both create-time guards so a model doesn't burn a batch on them: it requires `instagramPublishType: REEL` (`instagram.trialReelOnlyForReels`) and rejects `instagramCollaborators` (`instagram.trialReelNoCollaborators`). Backend-accepted since the trial-reel migration; likewise undiscoverable until now.

## 0.4.2

### Patch Changes

- Mention `postPreview` in the `list_inbox_conversations` and `get_inbox_conversation` descriptions — one clause each: it carries the post's caption and thumbnail and, when available, its public permalink, so a model can link the user straight to the post on the platform (permalink is null on Instagram for now). The backend has been returning the field all along; descriptions are how models learn to use it. Docs-only — parity holds at 24 tools with names, order, and inputSchemas byte-identical, and server instructions unchanged.

## 0.4.1

### Patch Changes

- Client-language sweep: TikTok is just "TikTok" — removed every "Business connections"/"Business API"/"Business accounts" qualifier from tool descriptions, server instructions, README, manifest, and skills (sounds, inbox coverage, firstComment). The literal `tiktokMusic.requiresBusinessApi` error code stays documented as the reconnect signal.

## 0.4.0

### Minor Changes

- TikTok sound selection: new `list_tiktok_sounds` tool (trending pre-cleared Commercial Music Library tracks for connected TikTok accounts, with genre/country/date-range filters) and two `create_posts` controls — `tiktokMusicSoundId` (mutually exclusive with `tiktokAutoAddMusic`, not applied to drafts) and `tiktokMusicSoundName` (composer display label). The tool carries a `portMethod`, so hosts on an older adapter skip it cleanly until they implement `listTikTokSounds`.

## 0.3.1

### Patch Changes

- Docs and hints for the inbox wave — no schema changes: server instructions (both bindings) gain a Social Inbox section (read flow, server-computed reply capability, comments-only framing), the README tool table covers all 23 tools, manifest.json lists the full tool set, and a `social-inbox` skill ships alongside the posting skill.

## 0.3.0

### Minor Changes

- a3bd898: Add the 10 social-inbox tools to the catalog (comments on TikTok / Instagram / Facebook Pages / Threads posts): list/get conversations, list items, unread count, public reply, Instagram private reply, hide/unhide/delete moderation, mark-read, status triage, and assignment — all `binding: 'both'`, with descriptions steering models to the server-computed reply capability (canReply / maxReplyLength / windowState / disabledReason). The stdio bin implements them over `/social-inbox/*`. The 10 new `BackendPort` methods are optional and the registrar skips (with a log) any tool whose port method is absent, so hosts on an older adapter deploy cleanly and pick the tools up when their adapter catches up. The release workflow now notifies social-schedule-mcp (`catalog-release` repository_dispatch) after a successful publish.

## 0.2.0

### Minor Changes

- aa9b489: Extract the shared tool catalog to `postfast-mcp/core`: every tool is now authored once in `src/core` (zod schema, description, title, annotations, outputSchema, binding) and consumed by the stdio bin via a `BackendPort` REST adapter. The stdio surface is additive — all 13 tools gain title/annotations/outputSchema, initialize gains server instructions, and tool results gain structuredContent — plus sentence-level description upgrades ported from the richer remote twin. The bin entry moved to `dist/stdio/index.js`, zod is now a declared dependency, and releases run through changesets (trusted publishing to npm + MCP Registry + MCPB GitHub Release).
