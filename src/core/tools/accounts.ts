import { z } from 'zod';
import type { ConnectLinkArgs, FollowerHistoryArgs } from '../backend-port.js';
import { dataListOutputSchema } from '../shared.js';
import type { ToolDef } from '../tool-def.js';

export const accountTools: ToolDef[] = [
  {
    name: 'list_accounts',
    binding: 'both',
    title: 'List Accounts',
    description:
      'List all social media accounts connected to the workspace. Each account includes connectionStatus (CONNECTED or DISABLED) and disabledReason (null unless DISABLED), plus followerCount (latest stored snapshot, a string; absent for platforms without follower data), followerCountUpdatedAt, and inboxCapable (whether the account can appear in the social inbox, i.e. comment ingestion is supported). A DISABLED account will not publish until the user reconnects it — pre-check before scheduling. For a follower trend over time, use get_follower_history.',
    inputSchema: {},
    outputSchema: dataListOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    run: (port, _args, workspaceId) => port.listAccounts(workspaceId),
  },
  {
    name: 'list_pinterest_boards',
    binding: 'both',
    title: 'List Pinterest Boards',
    description:
      'List Pinterest boards for a connected Pinterest account (pass its socialMediaId). Use a returned board’s boardId field as controls.pinterestBoardId in create_posts.',
    inputSchema: {
      socialMediaId: z.uuid().describe('Pinterest account id (from list_accounts)'),
    },
    outputSchema: dataListOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) =>
      port.listPinterestBoards(args.socialMediaId as string, workspaceId),
  },
  {
    name: 'list_youtube_playlists',
    binding: 'both',
    title: 'List YouTube Playlists',
    description:
      'List YouTube playlists for a connected YouTube account (pass its socialMediaId). Use a returned playlist’s playlistId field as controls.youtubePlaylistId in create_posts.',
    inputSchema: {
      socialMediaId: z.uuid().describe('YouTube account id (from list_accounts)'),
    },
    outputSchema: dataListOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) =>
      port.listYoutubePlaylists(args.socialMediaId as string, workspaceId),
  },
  {
    name: 'list_gbp_locations',
    binding: 'both',
    title: 'List Google Business Profile Locations',
    description:
      'List Google Business Profile locations for a connected GBP account (pass its socialMediaId). Use a returned location’s locationId field as controls.gbpLocationId in create_posts.',
    inputSchema: {
      socialMediaId: z.uuid().describe('GBP account id (from list_accounts)'),
    },
    outputSchema: dataListOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) =>
      port.listGbpLocations(args.socialMediaId as string, workspaceId),
  },
  {
    name: 'get_follower_history',
    binding: 'both',
    title: 'Get Follower History',
    description:
      'Daily follower-count snapshots for one connected account (pass its socialMediaId from list_accounts). Returns currentFollowerCount, delta (current − first snapshot in range), trackingStartedAt (when PostFast began recording this account), and a series of { capturedAt, followerCount } points. All counts are strings (bigint); currentFollowerCount, delta, and trackingStartedAt may be absent until the account has its first snapshot. Optional from/to bound the range (ISO 8601; default last 90 days, capped at 365). Snapshots are forward-only — no data before trackingStartedAt. Coverage: Facebook Pages, Instagram, YouTube, Pinterest, Threads, Bluesky, Telegram, LinkedIn company pages, and TikTok. Not available: X, personal Facebook.',
    inputSchema: {
      socialMediaId: z.uuid().describe('Account id (from list_accounts)'),
      from: z
        .string()
        .optional()
        .describe('Range start (ISO 8601, e.g. 2026-03-01T00:00:00.000Z). Defaults to 90 days ago.'),
      to: z
        .string()
        .optional()
        .describe('Range end (ISO 8601). Defaults to now; range is capped at 365 days.'),
    },
    outputSchema: {
      socialMediaId: z.string().optional(),
      series: z.array(z.unknown()).optional(),
      currentFollowerCount: z.string().optional(),
      delta: z.string().optional(),
      trackingStartedAt: z.string().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    run: (port, args, workspaceId) =>
      port.getFollowerHistory(args as unknown as FollowerHistoryArgs, workspaceId),
  },
  {
    name: 'search_places',
    binding: 'both',
    title: 'Search Places',
    description:
      'Search for a place to geotag a post. Pass free text (min 2 chars, e.g. a venue name or address); returns matching places, each with an id that works as BOTH controls.facebookPlaceId (Facebook feed posts) and controls.instagramLocationId (Instagram single-media posts). Only Facebook Pages that carry location data are returned.',
    inputSchema: {
      query: z.string().min(2).describe('Place search text, min 2 characters (e.g. "eiffel tower")'),
    },
    outputSchema: dataListOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) => port.searchPlaces(args.query as string, workspaceId),
  },
  {
    name: 'generate_connect_link',
    binding: 'both',
    title: 'Generate Connect Link',
    description:
      'Generate a shareable link for external clients to connect their social accounts to the workspace.',
    inputSchema: {
      expiryDays: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(7)
        .describe('Link expiry in days (1-30, default 7)'),
      sendEmail: z.boolean().default(false).describe('Send the link via email'),
      email: z
        .email()
        .optional()
        .describe('Recipient email (required when sendEmail is true)'),
    },
    outputSchema: { connectUrl: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) =>
      port.generateConnectLink(args as unknown as ConnectLinkArgs, workspaceId),
  },
];
