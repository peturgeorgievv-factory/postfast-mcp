import { z } from 'zod';
import type { ListTikTokSoundsArgs } from '../backend-port.js';
import type { ToolDef } from '../tool-def.js';

export const tiktokTools: ToolDef[] = [
  {
    name: 'list_tiktok_sounds',
    binding: 'both',
    title: 'List TikTok Sounds',
    description:
      "List trending pre-cleared Commercial Music Library tracks for a connected TikTok account. Returns up to 100 trending sounds with musicSoundId, name, artist, duration, and preview/thumbnail URLs. Pass a musicSoundId to create_posts as tiktokMusicSoundId to attach that sound to a TikTok photo/carousel post. genre takes raw TikTok values like 'POP', 'HIP_HOP/RAP', 'R&B/SOUL', 'K-POP' (invalid values return the full valid list in the error). The list rotates daily — fetch fresh rather than reusing old ids for display. An unknown countryCode returns an empty list. If the API returns tiktokMusic.requiresBusinessApi, the TikTok account needs a one-time reconnect.",
    inputSchema: {
      socialMediaId: z.uuid().describe('TikTok account id (from list_accounts)'),
      genre: z
        .string()
        .optional()
        .describe(
          "Raw TikTok genre value, e.g. 'POP', 'HIP_HOP/RAP', 'R&B/SOUL', 'K-POP'. Omit for all genres; an invalid value returns the full valid list in the error.",
        ),
      countryCode: z
        .string()
        .length(2)
        .optional()
        .describe('2-letter uppercase country code (default US). Unknown codes return an empty list.'),
      dateRange: z
        .enum(['1DAY', '7DAY', '30DAY', '90DAY'])
        .optional()
        .describe('Trending window (default 7DAY)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    portMethod: 'listTikTokSounds',
    run: (port, args, workspaceId) =>
      port.listTikTokSounds!(args as unknown as ListTikTokSoundsArgs, workspaceId),
  },
];
