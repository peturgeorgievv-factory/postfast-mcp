import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PostFastClient } from '../client.js';
import type {
  SocialAccount,
  PinterestBoard,
  YouTubePlaylist,
  GbpLocation,
} from '../types.js';

export function registerAccountTools(
  server: McpServer,
  client: PostFastClient,
) {
  server.tool(
    'list_accounts',
    'List all social media accounts connected to the workspace',
    {},
    async () => {
      const data = await client.get<SocialAccount[]>(
        '/social-media/my-social-accounts',
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.tool(
    'list_pinterest_boards',
    'List Pinterest boards for a connected Pinterest account',
    {
      socialMediaId: z
        .string()
        .uuid()
        .describe('Pinterest account ID (from list_accounts)'),
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

  server.tool(
    'list_youtube_playlists',
    'List YouTube playlists for a connected YouTube account',
    {
      socialMediaId: z
        .string()
        .uuid()
        .describe('YouTube account ID (from list_accounts)'),
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

  server.tool(
    'list_gbp_locations',
    'List Google Business Profile locations for a connected GBP account',
    {
      socialMediaId: z
        .string()
        .uuid()
        .describe('GBP account ID (from list_accounts)'),
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

  server.tool(
    'generate_connect_link',
    'Generate a shareable link for external clients to connect their social accounts to the workspace',
    {
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
        .string()
        .email()
        .optional()
        .describe('Recipient email (required if sendEmail is true)'),
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
