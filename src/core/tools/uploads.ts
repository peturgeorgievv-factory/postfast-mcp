import { z } from 'zod';
import type {
  UploadFromUrlArgs,
  UploadMediaArgs,
  UploadUrlsArgs,
} from '../backend-port.js';
import {
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  dataListOutputSchema,
} from '../shared.js';
import type { ToolDef } from '../tool-def.js';

const SUPPORTED_MIME_TYPES = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(', ');

/**
 * `upload_media` exists on BOTH bindings but is a different tool on each:
 * the stdio bin reads a local file from disk (only possible on the user's
 * machine), while the remote host ingests a conversation-attached file or
 * base64 bytes. They share the name, not the schema — hence two defs.
 */
export const uploadTools: ToolDef[] = [
  {
    name: 'get_upload_urls',
    binding: 'stdio',
    title: 'Get Upload URLs',
    description:
      'Get signed upload URLs for media files. Upload your file to the returned URL via PUT, then use the key in create_posts mediaItems.',
    inputSchema: {
      contentType: z
        .string()
        .describe(`MIME type of the file. Supported: ${SUPPORTED_MIME_TYPES}`),
      count: z
        .number()
        .int()
        .min(1)
        .max(8)
        .default(1)
        .describe('Number of upload URLs (1-8 for images, 1 for videos)'),
    },
    outputSchema: dataListOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) =>
      port.getUploadUrls(args as unknown as UploadUrlsArgs, workspaceId),
  },
  {
    name: 'upload_media',
    binding: 'stdio',
    title: 'Upload Media',
    description:
      'Upload a local file to PostFast and get back a media key for use in create_posts. Handles the full flow: detects content type, gets a signed URL, uploads the file, and returns the key and type.',
    inputSchema: {
      filePath: z
        .string()
        .describe('Absolute path to the local file (e.g. /Users/me/photo.jpg)'),
    },
    outputSchema: {
      key: z.string().optional(),
      type: z.string().optional(),
      contentType: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: (port, args) => port.uploadLocalFile(args.filePath as string),
  },
  {
    name: 'upload_from_url',
    binding: 'remote',
    title: 'Upload Media From URL',
    description:
      'Fetch media from a public https URL and store it for use in create_posts. Returns { media_id, type }; pass media_id as a mediaItems[].key. Ideal for ChatGPT/Claude-generated image URLs and remote CDN media. Redirects are followed (each hop is SSRF-validated); the URL must be public https and within the size limit. Supported types: image/jpeg, image/png, image/gif, image/webp, video/mp4, video/webm, video/quicktime.',
    inputSchema: {
      sourceUrl: z.url().describe('Public https URL of the media to upload'),
      contentType: z
        .string()
        .optional()
        .describe("MIME type override. If omitted, the source's Content-Type is used."),
    },
    outputSchema: {
      media_id: z.string().optional(),
      type: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) =>
      port.uploadFromUrl(args as unknown as UploadFromUrlArgs, workspaceId),
  },
  {
    name: 'upload_media',
    binding: 'remote',
    title: 'Upload Media',
    description:
      'Upload an image/video that is present in this conversation, for use in create_posts. Pass EITHER a ChatGPT-attached or model-generated file (the `file` argument — ChatGPT fills this automatically) OR base64 bytes (`data` + `contentType`). Returns { media_id, type }; use media_id as a mediaItems[].key. For large or remote media, prefer upload_from_url. Supported types: image/jpeg, image/png, image/gif, image/webp, video/mp4, video/webm, video/quicktime.',
    inputSchema: {
      file: z
        .object({
          download_url: z.url().describe('Temporary URL to fetch the file'),
          file_id: z.string(),
          mime_type: z.string().optional(),
          file_name: z.string().optional(),
        })
        .optional()
        .describe('A ChatGPT-provided file (attached or generated). Filled in automatically by ChatGPT.'),
      data: z
        .string()
        .optional()
        .describe('Base64-encoded file bytes (alternative to file; no data: prefix)'),
      contentType: z
        .string()
        .optional()
        .describe('MIME type for base64 data (e.g. image/png). Required with data.'),
    },
    outputSchema: {
      media_id: z.string().optional(),
      type: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { 'openai/fileParams': ['file'] },
    run: (port, args, workspaceId) =>
      port.uploadMedia(args as unknown as UploadMediaArgs, workspaceId),
  },
];
