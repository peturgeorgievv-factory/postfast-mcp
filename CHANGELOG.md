# postfast-mcp

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
