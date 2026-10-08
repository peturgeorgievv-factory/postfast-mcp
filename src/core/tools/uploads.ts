import { z } from 'zod';
import type {
  UploadFromUrlArgs,
  UploadMediaArgs,
  UploadUrlsArgs,
} from '../backend-port.js';
import { IMAGE_MIME_TYPES, VIDEO_MIME_TYPES } from '../shared.js';
import type { ToolDef } from '../tool-def.js';

const MEDIA_MIME_TYPES = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(', ');
/** Every type the upload tools take, as their descriptions list them. */
const SUPPORTED_TYPES = `${MEDIA_MIME_TYPES}, and for caption files application/x-subrip (.srt) and text/vtt (.vtt)`;
/** Where an upload that comes back as CAPTION goes in create_posts. */
const CAPTION_RESULT =
  'A CAPTION media_id (an .srt or .vtt caption file) goes in controls.youtubeCaptionKey, never in mediaItems.';

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
      'Get signed upload URLs for media and caption files. Upload your file to the returned URL via PUT, then use the key in create_posts mediaItems; the key of a caption file (.srt or .vtt) goes in controls.youtubeCaptionKey instead, never in mediaItems.',
    inputSchema: {
      contentType: z
        .string()
        .describe(`MIME type of the file. Supported: ${SUPPORTED_TYPES}`),
      count: z
        .number()
        .int()
        .min(1)
        .max(8)
        .default(1)
        .describe('Number of upload URLs (1-8 for images, 1 for videos and caption files)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: (port, args, workspaceId) =>
      port.getUploadUrls(args as unknown as UploadUrlsArgs, workspaceId),
  },
  {
    name: 'upload_media',
    binding: 'stdio',
    title: 'Upload Media',
    description:
      'Upload a local file to PostFast and get back a media key for use in create_posts. Handles the full flow: detects content type, gets a signed URL, uploads the file, and returns the key and type. Images and videos come back as IMAGE or VIDEO, for mediaItems; an .srt or .vtt caption file comes back as CAPTION, and its key goes in controls.youtubeCaptionKey, never in mediaItems.',
    inputSchema: {
      filePath: z
        .string()
        .describe('Absolute path to the local file (e.g. /Users/me/photo.jpg)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: (port, args) => port.uploadLocalFile(args.filePath as string),
  },
  {
    name: 'upload_from_url',
    binding: 'remote',
    title: 'Upload Media From URL',
    description:
      `Fetch media from a public https URL and store it for use in create_posts. Returns { media_id, type }; pass an IMAGE or VIDEO media_id as a mediaItems[].key. ${CAPTION_RESULT} ` +
      'Use this when the media is already at a public https URL, such as a CDN or hosted image.' +
      ` Redirects are followed (each hop is SSRF-validated); the URL must be public https and within the size limit. For a caption file, link to the file itself; a share page doesn't work. Supported types: ${SUPPORTED_TYPES}.`,
    inputSchema: {
      sourceUrl: z.url().describe('Public https URL of the media to upload'),
      contentType: z
        .string()
        .optional()
        .describe(
          "MIME type override. If omitted, the source's Content-Type is used. Set it for a caption file: application/x-subrip for .srt, text/vtt for .vtt.",
        ),
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
      "Upload an image, video or caption file for use in create_posts. If the media is already at a public https URL, use upload_from_url instead. If the user attached or generated the file in this conversation and your app passes files to tools, pass it as `file`; the app fills it in. Otherwise pass the file's bytes as base64 in `data` with its MIME type in `contentType`. Only if you can do neither, ask the user for a public https link and use upload_from_url. Returns { media_id, type }; use an IMAGE or VIDEO media_id as a mediaItems[].key. " +
      `${CAPTION_RESULT} Supported types: ${SUPPORTED_TYPES}.`,
    inputSchema: {
      file: z
        .object({
          download_url: z.url().describe('Temporary URL to fetch the file'),
          file_id: z.string(),
          mime_type: z.string().optional(),
          file_name: z.string().optional(),
        })
        .optional()
        .describe(
          "The file the user attached or generated in this conversation, for apps that pass files to tools; the app fills it in. If yours doesn't, leave this empty and use data + contentType.",
        ),
      data: z
        .string()
        .optional()
        .describe('Base64-encoded file bytes (alternative to file; no data: prefix)'),
      contentType: z
        .string()
        .optional()
        .describe(
          'MIME type for base64 data (e.g. image/png; application/x-subrip for an .srt caption file, text/vtt for a .vtt one). Required with data.',
        ),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { 'openai/fileParams': ['file'] },
    run: (port, args, workspaceId) =>
      port.uploadMedia(args as unknown as UploadMediaArgs, workspaceId),
  },
];
