import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PostFastClient } from '../client.js';
import type { PaginatedPosts, AnalyticsResponse } from '../types.js';

const PLATFORMS = [
  'FACEBOOK',
  'INSTAGRAM',
  'X',
  'TIKTOK',
  'LINKEDIN',
  'YOUTUBE',
  'BLUESKY',
  'THREADS',
  'PINTEREST',
  'TELEGRAM',
  'GOOGLE_BUSINESS_PROFILE',
] as const;

const STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'] as const;

/** Some MCP clients stringify complex params — parse them back before validation. */
function jsonParse<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  }, schema);
}

export function registerPostTools(server: McpServer, client: PostFastClient) {
  server.registerTool(
    'list_posts',
    {
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
          .describe('Fetch only these post IDs (workspace-scoped; max 100)'),
        platforms: z
          .array(z.enum(PLATFORMS))
          .optional()
          .describe('Filter by platforms'),
        statuses: z
          .array(z.enum(STATUSES))
          .optional()
          .describe('Filter by post statuses'),
        from: z
          .string()
          .optional()
          .describe('Start date filter (ISO 8601, e.g. 2025-01-01T00:00:00.000Z)'),
        to: z
          .string()
          .optional()
          .describe('End date filter (ISO 8601, e.g. 2025-01-31T23:59:59.999Z)'),
      },
    },
    async (input) => {
      const data = await client.get<PaginatedPosts>('/social-posts', {
        page: String(input.page),
        limit: String(input.limit),
        ids: input.ids?.join(','),
        platforms: input.platforms?.join(','),
        statuses: input.statuses?.join(','),
        from: input.from,
        to: input.to,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'create_posts',
    {
      description:
        'Create and schedule social media posts. Supports batch creation (up to 15 posts). Each post targets a specific social account. Scheduling to a disconnected account (connectionStatus DISABLED in list_accounts) is rejected with HTTP 400 "socialMediaDisconnected" — pre-check connectionStatus before calling. Saving as DRAFT to a disconnected account is allowed. TikTok, Instagram, YouTube, Pinterest, and Google Business Profile require at least one media item EVEN FOR DRAFTS — attach media first (upload via upload_media or get_upload_urls, then reference the key in mediaItems).',
      inputSchema: {
        posts: jsonParse(
          z
            .array(
              z.object({
                content: z.string().describe('Post text content'),
                firstComment: z.string().optional().describe('First comment posted automatically after publishing. Supported on X, Instagram, Facebook, YouTube, Threads, and TikTok (TikTok: Business accounts only, max 150 chars, comments must be enabled).'),
                mediaItems: z
                  .array(
                    z.object({
                      key: z.string().describe('S3 media key from get_upload_urls'),
                      type: z.enum(['IMAGE', 'VIDEO']),
                      sortOrder: z.number().int().min(0),
                      coverImageKey: z.string().optional().describe('S3 key of a custom cover/thumbnail image for video posts (upload via get_upload_urls first). Supported on Instagram Reels, Facebook Reels, Pinterest video pins.'),
                      coverTimestamp: z.string().optional().describe('Video cover timestamp in milliseconds (e.g. "5000" = 5s). Fallback when coverImageKey is also provided.'),
                    }),
                  )
                  .optional()
                  .describe('Media attachments'),
                scheduledAt: z
                  .string()
                  .optional()
                  .describe(
                    'Schedule time (ISO 8601). Required when status is SCHEDULED.',
                  ),
                socialMediaId: z
                  .uuid()
                  .describe('Target social account ID (from list_accounts)'),
              }),
            )
            .min(1)
            .max(15)
            .describe('Array of posts to create'),
        ),
        status: z
          .enum(['DRAFT', 'SCHEDULED'])
          .default('SCHEDULED')
          .describe('Post status. SCHEDULED requires scheduledAt on all posts.'),
        approvalStatus: z
          .enum(['PENDING_APPROVAL', 'APPROVED'])
          .default('APPROVED')
          .describe('Approval workflow status'),
        controls: jsonParse(
          z.object({
            // X/Twitter
            xRetweetUrl: z.string().optional(),
            // TikTok
            tiktokPrivacy: z.enum(['PUBLIC', 'MUTUAL_FRIENDS', 'FOLLOWER_OF_CREATOR', 'ONLY_ME']).optional().describe('Deprecated. TikTok videos use the account default privacy (no per-post control) and photos default to public; use a draft for private posts.'),
            tiktokIsDraft: z.boolean().optional(),
            tiktokAllowComments: z.boolean().optional(),
            tiktokAllowDuet: z.boolean().optional(),
            tiktokAllowStitch: z.boolean().optional(),
            tiktokBrandOrganic: z.boolean().optional(),
            tiktokBrandContent: z.boolean().optional(),
            tiktokAutoAddMusic: z.boolean().optional(),
            tiktokIsAigc: z.boolean().optional().describe('Declare video as AI-generated content'),
            tiktokTitle: z.string().max(90).optional().describe('Title for TikTok photo posts (max 90 chars; photo posts only). When set, the full post content becomes the description; without it, content auto-splits on the first newline into title + description.'),
            // Instagram
            instagramPostToGrid: z.boolean().optional(),
            instagramPublishType: z.enum(['TIMELINE', 'STORY', 'REEL']).optional(),
            instagramCollaborators: z.array(z.string()).optional(),
            instagramLocationId: z.string().optional().describe('Geotag: same FB Page id from search_places. Single media only, not carousels.'),
            instagramLocationName: z.string().max(255).optional().describe('Display-only location name (not sent to Meta).'),
            // YouTube
            youtubePrivacy: z.enum(['PUBLIC', 'PRIVATE', 'UNLISTED']).optional(),
            youtubeTags: z.array(z.string()).optional(),
            youtubeCategoryId: z.string().optional(),
            youtubeIsShort: z.boolean().optional(),
            youtubeMadeForKids: z.boolean().optional(),
            youtubeTitle: z.string().optional(),
            youtubePlaylistId: z.string().optional(),
            youtubeThumbnailKey: z.string().optional().describe('S3 media key for custom YouTube video thumbnail (image, max 2MB, min 640px wide, 1280x720 recommended)'),
            // Facebook
            facebookContentType: z.enum(['POST', 'REEL', 'STORY']).optional(),
            facebookAllowComments: z.boolean().optional(),
            facebookPrivacy: z
              .enum(['PUBLIC', 'FRIENDS_OF_FRIENDS', 'FRIENDS', 'SELF'])
              .optional(),
            facebookCarouselMainLink: z.string().optional(),
            facebookCarouselShowEndCard: z.boolean().optional(),
            facebookReelsCollaborators: z.array(z.string()).optional(),
            facebookTargetCountries: z.array(z.string().length(2)).max(25).optional().describe('Facebook only: ISO 3166-1 alpha-2 codes (max 25). Limits who can see the post; also hidden from logged-out viewers. Feed posts only, not Reels/Stories.'),
            facebookPlaceId: z.string().optional().describe('Geotag: FB Page id (with location) from search_places. Feed posts only.'),
            facebookPlaceName: z.string().optional().describe('Display-only place name (not sent to Meta).'),
            // Google Business Profile
            gbpLocationId: z.string().optional().describe('GBP location resource name (from list_gbp_locations)'),
            gbpTopicType: z.enum(['STANDARD', 'EVENT', 'OFFER']).optional().describe('Post type'),
            gbpCallToActionType: z.enum(['BOOK', 'ORDER', 'LEARN_MORE', 'SIGN_UP', 'CALL', 'SHOP']).optional(),
            gbpCallToActionUrl: z.string().optional().describe('CTA button URL (not needed for CALL, ignored for OFFER)'),
            gbpEventTitle: z.string().optional().describe('Title for EVENT/OFFER posts (max 58 chars)'),
            gbpEventStartDate: z.string().optional().describe('Start date for EVENT/OFFER (ISO 8601)'),
            gbpEventEndDate: z.string().optional().describe('End date for EVENT/OFFER (ISO 8601)'),
            gbpOfferCouponCode: z.string().optional().describe('Coupon code (OFFER only)'),
            gbpOfferRedeemUrl: z.string().optional().describe('Redemption URL (OFFER only)'),
            gbpOfferTerms: z.string().optional().describe('Terms and conditions (OFFER only)'),
            // Pinterest
            pinterestBoardId: z.string().optional(),
            pinterestLink: z.string().optional(),
            // LinkedIn
            linkedinAttachmentKey: z.string().optional(),
            linkedinAttachmentTitle: z.string().optional(),
          })
          .optional()
          .describe('Platform-specific controls (shared across all posts in the batch)'),
        ),
      },
    },
    async (input) => {
      const data = await client.post<{ postIds: string[] }>('/social-posts', {
        posts: input.posts,
        status: input.status,
        approvalStatus: input.approvalStatus,
        controls: input.controls,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'delete_post',
    {
      description: 'Delete a social media post by ID',
      inputSchema: {
        id: z.uuid().describe('Post ID to delete'),
      },
    },
    async (input) => {
      const data = await client.delete<{ deleted: boolean }>(
        `/social-posts/${input.id}`,
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_post_analytics',
    {
      description:
        'Fetch published posts with their latest performance metrics (impressions, reach, likes, comments, shares). Only returns published posts that have a platform post ID. LinkedIn personal accounts are excluded. Supported: Instagram, Facebook, TikTok, Threads, YouTube, LinkedIn (company pages), Pinterest (Business accounts). Pinterest extras include pin_clicks, outbound_clicks, saves_90d, save_rate_90d (saves are 90-day rolling because Pinterest API does not expose lifetime totals); video pins additionally surface mrc_views, views_10s, avg_watch_time, v50_watch_time, video_starts, quartile_95_views. Video posts also include normalized watch-time on latestMetric: avgWatchTimeSeconds, totalWatchTimeSeconds, videoViews (Facebook, Instagram Reels, YouTube, Pinterest, LinkedIn company pages, TikTok). Instagram posts also include saveRate on latestMetric (saves / reach as a percentage, rounded to 2 decimals; feed posts, reels, and carousels), and Instagram Reels additionally include reelsSkipRate (percentage of viewers who skipped the reel in the first 3 seconds, rounded to 2 decimals; may be absent on low-view reels or until metrics refresh). TikTok also exposes total_time_watched, average_time_watched, and full_video_watched_rate in metric.extras.',
      inputSchema: {
        startDate: z
          .string()
          .describe('Start of date range (ISO 8601, e.g. 2026-01-01T00:00:00.000Z)'),
        endDate: z
          .string()
          .describe('End of date range (ISO 8601, e.g. 2026-01-31T23:59:59.999Z)'),
        platforms: z
          .array(z.enum(PLATFORMS))
          .optional()
          .describe('Filter by platforms'),
        socialMediaIds: z
          .array(z.uuid())
          .optional()
          .describe('Filter by specific social media account IDs'),
      },
    },
    async (input) => {
      const data = await client.get<AnalyticsResponse>('/social-posts/analytics', {
        startDate: input.startDate,
        endDate: input.endDate,
        platforms: input.platforms?.join(','),
        socialMediaIds: input.socialMediaIds?.join(','),
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
