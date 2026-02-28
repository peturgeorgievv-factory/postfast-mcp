import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PostFastClient } from '../client.js';
import type { SignedUploadUrl } from '../types.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export function registerFileTools(server: McpServer, client: PostFastClient) {
  server.tool(
    'get_upload_urls',
    'Get signed upload URLs for media files. Upload your file to the returned URL via PUT, then use the key in create_posts mediaItems.',
    {
      contentType: z
        .string()
        .describe(
          `MIME type of the file. Supported: ${[...IMAGE_TYPES, ...VIDEO_TYPES].join(', ')}`,
        ),
      count: z
        .number()
        .int()
        .min(1)
        .max(8)
        .default(1)
        .describe('Number of upload URLs (1-8 for images, 1 for videos)'),
    },
    async (input) => {
      const data = await client.post<SignedUploadUrl[]>(
        '/file/get-signed-upload-urls',
        {
          contentType: input.contentType,
          count: input.count,
        },
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
