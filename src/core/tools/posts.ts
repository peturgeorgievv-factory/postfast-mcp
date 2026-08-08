import { z } from 'zod';
import type {
  AnalyticsArgs,
  ApprovePostsArgs,
  CreatePostsArgs,
  ListPostsArgs,
} from '../backend-port.js';
import {
  CREATE_APPROVAL_STATUSES,
  CREATE_STATUSES,
  PLATFORMS,
  POST_STATUSES,
  SET_APPROVAL_STATUSES,
  dataListOutputSchema,
  jsonParse,
} from '../shared.js';
import type { Binding, ToolDef } from '../tool-def.js';

/** The upload tools available on each binding, for prose that names them. */
const UPLOAD_TOOLS: Record<Binding, string> = {
  stdio: 'upload_media / get_upload_urls',
  remote: 'upload_from_url / upload_media',
};

const mediaItemSchema = (binding: Binding) =>
  z.object({
    key: z
      .string()
      .describe(`Media key from ${UPLOAD_TOOLS[binding]} (e.g. image/<uuid>.jpg)`),
    type: z.enum(['IMAGE', 'VIDEO']),
    sortOrder: z.number().int().min(0),
    coverImageKey: z
      .string()
      .optional()
      .describe(
        'Media key of a custom cover/thumbnail for video posts. Supported on Instagram Reels, Facebook Reels, Pinterest video pins.',
      ),
    coverTimestamp: z
      .string()
      .optional()
      .describe(
        'Video cover timestamp in milliseconds (e.g. "5000" = 5s). Fallback when coverImageKey is also provided.',
      ),
  });

const postItemSchema = (binding: Binding) =>
  z.object({
    content: z.string().describe('Post text content'),
    firstComment: z
      .string()
      .optional()
      .describe(
        'First comment posted automatically after publishing. Supported on X, Instagram, Facebook, YouTube, Threads, and TikTok (TikTok: max 150 chars, comments must be enabled).',
      ),
    mediaItems: z
      .array(mediaItemSchema(binding))
      .optional()
      .describe('Media attachments'),
    scheduledAt: z
      .string()
      .optional()
      .describe('Schedule time (ISO 8601). Required when status is SCHEDULED.'),
    socialMediaId: z.uuid().describe('Target social account id (from list_accounts)'),
  });

/** Platform-specific controls — shared across every post in the batch. */
const controlsSchema = z.object({
  // X/Twitter
  xRetweetUrl: z.string().optional(),
  // TikTok
  tiktokPrivacy: z
    .enum(['PUBLIC', 'MUTUAL_FRIENDS', 'FOLLOWER_OF_CREATOR', 'ONLY_ME'])
    .optional()
    .describe(
      'Deprecated. TikTok videos use the account default privacy (no per-post control) and photos default to public; use a draft for private posts.',
    ),
  tiktokIsDraft: z.boolean().optional(),
  tiktokAllowComments: z.boolean().optional(),
  tiktokAllowDuet: z.boolean().optional(),
  tiktokAllowStitch: z.boolean().optional(),
  tiktokBrandOrganic: z.boolean().optional(),
  tiktokBrandContent: z.boolean().optional(),
  tiktokAutoAddMusic: z.boolean().optional(),
  tiktokIsAigc: z.boolean().optional().describe('Declare video as AI-generated content'),
  tiktokTitle: z
    .string()
    .max(90)
    .optional()
    .describe(
      'Title for TikTok photo posts (max 90 chars; photo posts only). When set, the full post content becomes the description; without it, content auto-splits on the first newline into title + description.',
    ),
  tiktokMusicSoundId: z
    .string()
    .max(128)
    .optional()
    .describe(
      'Commercial Music Library sound id from list_tiktok_sounds. TikTok photo/carousel posts only. Mutually exclusive with tiktokAutoAddMusic (sending both is rejected). Not applied when tiktokIsDraft is true. Omit for no sound.',
    ),
  tiktokMusicSoundName: z
    .string()
    .max(256)
    .optional()
    .describe(
      "Display label for the chosen sound, e.g. 'Ok I Like It — Milky Chance'. Stored for the composer UI only; set it whenever tiktokMusicSoundId is set.",
    ),
  // Instagram
  instagramPostToGrid: z.boolean().optional(),
  instagramPublishType: z.enum(['TIMELINE', 'STORY', 'REEL']).optional(),
  instagramCollaborators: z.array(z.string()).optional(),
  instagramLocationId: z
    .string()
    .optional()
    .describe(
      'Geotag a single-media IG post — a numeric Facebook Page id with location data from search_places (same id as facebookPlaceId). Image/video/reel/story only, NOT carousels.',
    ),
  instagramLocationName: z
    .string()
    .max(255)
    .optional()
    .describe(
      'Display-only place label from search_places (stored for your portal; never sent to Meta)',
    ),
  // YouTube
  youtubePrivacy: z.enum(['PUBLIC', 'PRIVATE', 'UNLISTED']).optional(),
  youtubeTags: z.array(z.string()).optional(),
  youtubeCategoryId: z.string().optional(),
  youtubeIsShort: z.boolean().optional(),
  youtubeMadeForKids: z.boolean().optional(),
  youtubeTitle: z.string().optional(),
  youtubePlaylistId: z
    .string()
    .optional()
    .describe('YouTube playlist id — the playlistId field from list_youtube_playlists'),
  youtubeThumbnailKey: z
    .string()
    .optional()
    .describe(
      'Media key for a custom YouTube thumbnail (image, max 2MB, min 640px wide, 1280x720 recommended)',
    ),
  // Facebook
  facebookContentType: z.enum(['POST', 'REEL', 'STORY']).optional(),
  facebookAllowComments: z.boolean().optional(),
  facebookPrivacy: z
    .enum(['PUBLIC', 'FRIENDS_OF_FRIENDS', 'FRIENDS', 'SELF'])
    .optional(),
  facebookCarouselMainLink: z.string().optional(),
  facebookCarouselShowEndCard: z.boolean().optional(),
  facebookReelsCollaborators: z.array(z.string()).optional(),
  facebookTargetCountries: z
    .array(z.string().length(2))
    .max(25)
    .optional()
    .describe(
      'Limit who can see a Facebook FEED post by country — ISO 3166-1 alpha-2 codes (case-insensitive), max 25. Audience gating (hidden from everyone else), feed posts only — not Reels/Stories/video.',
    ),
  facebookPlaceId: z
    .string()
    .optional()
    .describe(
      'Geotag a Facebook FEED post — a numeric Facebook Page id with location data from search_places (same id as instagramLocationId). Feed posts only (text/photo/carousel) — not Reels/Stories/video.',
    ),
  facebookPlaceName: z
    .string()
    .max(255)
    .optional()
    .describe(
      'Display-only place label from search_places (stored for your portal; never sent to Meta)',
    ),
  // Google Business Profile
  gbpLocationId: z
    .string()
    .optional()
    .describe('GBP location resource name — the locationId field from list_gbp_locations'),
  gbpTopicType: z.enum(['STANDARD', 'EVENT', 'OFFER']).optional().describe('Post type'),
  gbpCallToActionType: z
    .enum(['BOOK', 'ORDER', 'LEARN_MORE', 'SIGN_UP', 'CALL', 'SHOP'])
    .optional(),
  gbpCallToActionUrl: z
    .string()
    .optional()
    .describe('CTA button URL (not needed for CALL, ignored for OFFER)'),
  gbpEventTitle: z.string().optional().describe('Title for EVENT/OFFER posts (max 58 chars)'),
  gbpEventStartDate: z.string().optional().describe('Start date for EVENT/OFFER (ISO 8601)'),
  gbpEventEndDate: z.string().optional().describe('End date for EVENT/OFFER (ISO 8601)'),
  gbpOfferCouponCode: z.string().optional().describe('Coupon code (OFFER only)'),
  gbpOfferRedeemUrl: z.string().optional().describe('Redemption URL (OFFER only)'),
  gbpOfferTerms: z.string().optional().describe('Terms and conditions (OFFER only)'),
  // Pinterest
  pinterestBoardId: z
    .string()
    .optional()
    .describe(
      "Pinterest board id — the boardId field from list_pinterest_boards (NOT the account's socialMediaId)",
    ),
  pinterestLink: z.string().optional(),
  // LinkedIn
  linkedinAttachmentKey: z.string().optional(),
  linkedinAttachmentTitle: z.string().optional(),
});

export const postTools: ToolDef[] = [
  {
    name: 'list_posts',
    binding: 'both',
    title: 'List Posts',
    description:
      'List social media posts with optional filters for specific IDs, platform, status, and date range. Failed or missed posts carry a lastError { message, code }; codes include MISSED_DISCONNECTED (the account was disconnected when the post was due — reconnect, then retry) and MISSED_NOT_PUBLISHED (passed its scheduled time plus a 2h grace window without publishing).',
    inputSchema: {
      page: z.number().int().min(0).default(0).describe('Page number (0-based)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Posts per page (max 50)'),
      ids: z
        .array(z.uuid())
        .max(100)
        .optional()
        .describe('Fetch only these post ids (workspace-scoped; max 100; AND-ed with other filters)'),
      platforms: z.array(z.enum(PLATFORMS)).optional().describe('Filter by platforms'),
      statuses: z
        .array(z.enum(POST_STATUSES))
        .optional()
        .describe('Filter by post statuses'),
      from: z
        .string()
        .optional()
        .describe('Start date filter (ISO 8601, e.g. 2026-01-01T00:00:00.000Z)'),
      to: z
        .string()
        .optional()
        .describe('End date filter (ISO 8601, e.g. 2026-01-31T23:59:59.999Z)'),
    },
    outputSchema: {
      data: z.array(z.unknown()).optional(),
      totalCount: z.unknown().optional(),
      pageInfo: z.unknown().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    run: (port, args, workspaceId) =>
      port.listPosts(args as unknown as ListPostsArgs, workspaceId),
  },
  {
    name: 'create_posts',
    binding: 'both',
    title: 'Create Posts',
    description: (binding) =>
      'Create and schedule social media posts (batch up to 15). Each post targets one social account (socialMediaId from list_accounts). SCHEDULED requires scheduledAt on every post; DRAFT must omit scheduledAt. Scheduling to a disconnected account (connectionStatus DISABLED in list_accounts) is rejected with HTTP 400 "socialMediaDisconnected" — pre-check connectionStatus before calling. Saving as DRAFT to a disconnected account is allowed. TikTok, Instagram, YouTube, Pinterest, and Google Business Profile require at least one media item EVEN FOR DRAFTS — attach media first (ask the user for an image/video, or generate+upload one, if none was provided). Attach media via the key returned by ' +
      `${UPLOAD_TOOLS[binding]}.`,
    inputSchema: (binding) => ({
      posts: jsonParse(
        z
          .array(postItemSchema(binding))
          .min(1)
          .max(15)
          .describe('Array of posts to create (1-15)'),
      ),
      status: z
        .enum(CREATE_STATUSES)
        .default('SCHEDULED')
        .describe('Post status. SCHEDULED requires scheduledAt on every post.'),
      approvalStatus: z
        .enum(CREATE_APPROVAL_STATUSES)
        .default('APPROVED')
        .describe('Approval workflow status'),
      controls: jsonParse(
        controlsSchema
          .optional()
          .describe('Platform-specific controls (shared across all posts in the batch)'),
      ),
    }),
    outputSchema: { postIds: z.array(z.string()).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) =>
      port.createPosts(args as unknown as CreatePostsArgs, workspaceId),
  },
  {
    name: 'approve_posts',
    binding: 'remote',
    title: 'Approve Posts',
    description:
      'Set the approval status of one or more posts (approval workflow). Typically used to move posts to APPROVED so they can publish, or to PENDING_APPROVAL / REJECTED / NEEDS_WORK.',
    inputSchema: {
      postIds: z.array(z.uuid()).min(1).describe('Post ids to update'),
      approvalStatus: z.enum(SET_APPROVAL_STATUSES).describe('New approval status'),
    },
    outputSchema: { success: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) =>
      port.approvePosts(args as unknown as ApprovePostsArgs, workspaceId),
  },
  {
    name: 'delete_post',
    binding: 'both',
    title: 'Delete Post',
    description: 'Delete a social media post by id.',
    inputSchema: {
      id: z.uuid().describe('Post id to delete'),
    },
    outputSchema: { deleted: z.boolean().optional() },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    run: (port, args, workspaceId) => port.deletePost(args.id as string, workspaceId),
  },
  {
    name: 'get_post_analytics',
    binding: 'both',
    title: 'Get Post Analytics',
    description:
      'Fetch published posts with their latest performance metrics (impressions, reach, likes, comments, shares). Only returns published posts that have a platform post ID. LinkedIn personal accounts are excluded. Supported: Instagram, Facebook, TikTok, Threads, YouTube, LinkedIn (company pages), Pinterest (Business accounts). Metric counts are returned as strings. Pinterest extras include pin_clicks, outbound_clicks, saves_90d, save_rate_90d (saves are 90-day rolling because Pinterest API does not expose lifetime totals); video pins additionally surface mrc_views, views_10s, avg_watch_time, v50_watch_time, video_starts, quartile_95_views. Video posts also include normalized watch-time on latestMetric: avgWatchTimeSeconds, totalWatchTimeSeconds, videoViews (Facebook, Instagram Reels, YouTube, Pinterest, LinkedIn company pages, TikTok). Instagram posts also include on latestMetric: saveRate (saves / reach as a percentage, rounded to 2 decimals — on IG feed posts, reels, and carousels with metrics) and reelsSkipRate (Instagram Reels only — percentage of viewers who skipped the reel in the first 3 seconds, as reported by Instagram, rounded to 2 decimals; may be absent on low-view reels or until metrics refresh). TikTok also exposes total_time_watched, average_time_watched, and full_video_watched_rate in metric.extras.',
    inputSchema: {
      startDate: z
        .string()
        .describe('Start of date range (ISO 8601, e.g. 2026-01-01T00:00:00.000Z)'),
      endDate: z
        .string()
        .describe('End of date range (ISO 8601, e.g. 2026-01-31T23:59:59.999Z)'),
      platforms: z.array(z.enum(PLATFORMS)).optional().describe('Filter by platforms'),
      socialMediaIds: z
        .array(z.uuid())
        .optional()
        .describe('Filter by specific social media account ids'),
    },
    outputSchema: dataListOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) =>
      port.getPostAnalytics(args as unknown as AnalyticsArgs, workspaceId),
  },
];
