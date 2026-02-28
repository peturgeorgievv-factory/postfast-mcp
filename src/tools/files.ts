import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PostFastClient } from '../client.js';
import type { SignedUploadUrl } from '../types.js';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

function detectContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mime = MIME_MAP[ext];
  if (!mime) {
    throw new Error(
      `Unsupported file extension "${ext}". Supported: ${Object.keys(MIME_MAP).join(', ')}`,
    );
  }
  return mime;
}

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
        content: [
          { type: 'text' as const, text: JSON.stringify(data, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'upload_media',
    'Upload a local file to PostFast and get back a media key for use in create_posts. Handles the full flow: detects content type, gets a signed URL, uploads the file, and returns the key and mediaType.',
    {
      filePath: z
        .string()
        .describe(
          'Absolute path to the local file (e.g. /Users/me/photo.jpg)',
        ),
    },
    async (input) => {
      const contentType = detectContentType(input.filePath);
      const isVideo = contentType.startsWith('video/');

      const [uploadUrl] = await client.post<SignedUploadUrl[]>(
        '/file/get-signed-upload-urls',
        { contentType, count: 1 },
      );

      const fileBuffer = await readFile(input.filePath);

      const uploadResponse = await fetch(uploadUrl.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: fileBuffer,
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `Upload failed (${uploadResponse.status}): ${await uploadResponse.text()}`,
        );
      }

      const result = {
        key: uploadUrl.key,
        mediaType: isVideo ? 'VIDEO' : 'IMAGE',
        contentType,
      };

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
