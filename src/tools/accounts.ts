import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PostFastClient } from '../client.js';
import type {
  SocialAccount,
  PinterestBoard,
  YouTubePlaylist,
  GbpLocation,
  Place,
  FollowerHistory,
} from '../types.js';

export function registerAccountTools(
  server: McpServer,
  client: PostFastClient,
) {
  server.registerTool(
    'list_accounts',
    {
      description:
        'List all social media accounts connected to the workspace. Each account includes connectionStatus (CONNECTED or DISABLED) and disabledReason (null unless DISABLED), plus followerCount (latest stored snapshot, a string; absent for platforms without follower data), followerCountUpdatedAt, and inboxCapable (whether the account can appear in the social inbox, i.e. comment ingestion is supported). If connectionStatus is DISABLED, the account will not publish until the user reconnects it. For a follower trend over time, use get_follower_history.',
      inputSchema: {},
    },
    async () => {
      const data = await client.get<SocialAccount[]>(
        '/social-media/my-social-accounts',
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_pinterest_boards',
    {
      description: 'List Pinterest boards for a connected Pinterest account',
      inputSchema: {
        socialMediaId: z
          .uuid()
          .describe('Pinterest account ID (from list_accounts)'),
      },
    },
    async (input) => {
      const data = await client.get<PinterestBoard[]>(
        `/social-media/${input.socialMediaId}/pinterest-boards`,
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_youtube_playlists',
    {
      description: 'List YouTube playlists for a connected YouTube account',
      inputSchema: {
        socialMediaId: z
          .uuid()
          .describe('YouTube account ID (from list_accounts)'),
      },
    },
    async (input) => {
      const data = await client.get<YouTubePlaylist[]>(
        `/social-media/${input.socialMediaId}/youtube-playlists`,
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_gbp_locations',
    {
      description:
        'List Google Business Profile locations for a connected GBP account',
      inputSchema: {
        socialMediaId: z
          .uuid()
          .describe('GBP account ID (from list_accounts)'),
      },
    },
    async (input) => {
      const data = await client.get<GbpLocation[]>(
        `/social-media/${input.socialMediaId}/gbp-locations`,
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_follower_history',
    {
      description:
        'Daily follower-count snapshots for a connected account, plus the current count (currentFollowerCount) and the net change (delta) over the range. Date range via from/to (ISO 8601); defaults to the last 90 days, capped at 365. Tracking is forward-only: data starts at trackingStartedAt (when PostFast began recording this account), with no snapshots before then. All counts are strings (bigint); currentFollowerCount, delta, and trackingStartedAt may be absent until the account has its first snapshot. Coverage: Facebook Pages, Instagram, YouTube, Pinterest, Threads, Bluesky, Telegram, LinkedIn company pages, and TikTok. Not available: X, personal Facebook.',
      inputSchema: {
        socialMediaId: z
          .uuid()
          .describe('Account ID (from list_accounts)'),
        from: z
          .string()
          .optional()
          .describe(
            'Range start (ISO 8601, e.g. 2026-03-01T00:00:00.000Z). Defaults to 90 days ago.',
          ),
        to: z
          .string()
          .optional()
          .describe(
            'Range end (ISO 8601). Defaults to now. Range is capped at 365 days.',
          ),
      },
    },
    async (input) => {
      const data = await client.get<FollowerHistory>(
        `/social-media/${input.socialMediaId}/follower-history`,
        { from: input.from, to: input.to },
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'search_places',
    {
      description:
        'Find a place to tag. The returned id works for both facebookPlaceId and instagramLocationId.',
      inputSchema: {
        query: z
          .string()
          .min(2)
          .describe('Place name to search, e.g. "Eiffel Tower"'),
      },
    },
    async (input) => {
      const data = await client.get<Place[]>('/social-media/search-places', {
        q: input.query,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'generate_connect_link',
    {
      description:
        'Generate a shareable link for external clients to connect their social accounts to the workspace',
      inputSchema: {
        expiryDays: z
          .number()
          .int()
          .min(1)
          .max(30)
          .default(7)
          .describe('Link expiry in days (1-30, default 7)'),
        sendEmail: z
          .boolean()
          .default(false)
          .describe('Send the link via email'),
        email: z
          .email()
          .optional()
          .describe('Recipient email (required if sendEmail is true)'),
      },
    },
    async (input) => {
      const data = await client.post<{ connectUrl: string }>(
        '/social-media/connect-link',
        {
          expiryDays: input.expiryDays,
          sendEmail: input.sendEmail,
          email: input.email,
        },
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
