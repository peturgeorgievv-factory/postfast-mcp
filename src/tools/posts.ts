import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PostFastClient } from '../client.js';
import type { PaginatedPosts } from '../types.js';

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
] as const;

const STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'] as const;

export function registerPostTools(server: McpServer, client: PostFastClient) {
  server.tool(
    'list_posts',
    'List social media posts with optional filters for platform, status, and date range',
    {
      page: z.number().int().min(0).default(0).describe('Page number (0-based)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Posts per page (max 50)'),
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
    async (input) => {
      const data = await client.get<PaginatedPosts>('/social-posts', {
        page: String(input.page),
        limit: String(input.limit),
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

  server.tool(
    'create_posts',
    'Create and schedule social media posts. Supports batch creation (up to 15 posts). Each post targets a specific social account.',
    {
      posts: z
        .array(
          z.object({
            content: z.string().describe('Post text content'),
            firstComment: z.string().optional().describe('First comment to add after publishing'),
            mediaItems: z
              .array(
                z.object({
                  key: z.string().describe('S3 media key from get_upload_urls'),
                  type: z.enum(['IMAGE', 'VIDEO']),
                  sortOrder: z.number().int().min(0),
                  coverTimestamp: z.string().optional().describe('Video cover timestamp'),
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
              .string()
              .uuid()
              .describe('Target social account ID (from list_accounts)'),
          }),
        )
        .min(1)
        .max(15)
        .describe('Array of posts to create'),
      status: z
        .enum(['DRAFT', 'SCHEDULED'])
        .default('SCHEDULED')
        .describe('Post status. SCHEDULED requires scheduledAt on all posts.'),
      approvalStatus: z
        .enum(['PENDING_APPROVAL', 'APPROVED'])
        .default('APPROVED')
        .describe('Approval workflow status'),
      controls: z
        .object({
          // X/Twitter
          xCommunityId: z.string().optional(),
          xQuoteTweetUrl: z.string().optional(),
          xRetweetUrl: z.string().optional(),
          // TikTok
          tiktokPrivacy: z.enum(['PUBLIC', 'MUTUAL_FRIENDS', 'ONLY_ME']).optional(),
          tiktokIsDraft: z.boolean().optional(),
          tiktokAllowComments: z.boolean().optional(),
          tiktokAllowDuet: z.boolean().optional(),
          tiktokAllowStitch: z.boolean().optional(),
          tiktokBrandOrganic: z.boolean().optional(),
          tiktokBrandContent: z.boolean().optional(),
          tiktokAutoAddMusic: z.boolean().optional(),
          // Instagram
          instagramPostToGrid: z.boolean().optional(),
          instagramPublishType: z.enum(['TIMELINE', 'STORY', 'REEL']).optional(),
          instagramCollaborators: z.array(z.string()).optional(),
          // YouTube
          youtubePrivacy: z.enum(['PUBLIC', 'PRIVATE', 'UNLISTED']).optional(),
          youtubeTags: z.array(z.string()).optional(),
          youtubeCategoryId: z.string().optional(),
          youtubeIsShort: z.boolean().optional(),
          youtubeMadeForKids: z.boolean().optional(),
          youtubeTitle: z.string().optional(),
          youtubePlaylistId: z.string().optional(),
          // Facebook
          facebookContentType: z.enum(['POST', 'REEL', 'STORY']).optional(),
          facebookAllowComments: z.boolean().optional(),
          facebookPrivacy: z
            .enum(['PUBLIC', 'FRIENDS_OF_FRIENDS', 'FRIENDS', 'SELF'])
            .optional(),
          facebookCarouselMainLink: z.string().optional(),
          facebookCarouselShowEndCard: z.boolean().optional(),
          facebookReelsCoverImageKey: z.string().optional(),
          facebookReelsCollaborators: z.array(z.string()).optional(),
          // Pinterest
          pinterestBoardId: z.string().optional(),
          pinterestLink: z.string().optional(),
          // LinkedIn
          linkedinAttachmentKey: z.string().optional(),
          linkedinAttachmentTitle: z.string().optional(),
        })
        .optional()
        .describe('Platform-specific controls (shared across all posts in the batch)'),
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

  server.tool(
    'delete_post',
    'Delete a social media post by ID',
    {
      id: z.string().uuid().describe('Post ID to delete'),
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
}
