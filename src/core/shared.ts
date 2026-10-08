import { z } from 'zod';
import type { UploadType } from './types.js';

export const PLATFORMS = [
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

export const POST_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'] as const;
export const INBOX_CONVERSATION_STATUSES = ['OPEN', 'SNOOZED', 'CLOSED'] as const;
export const INBOX_ITEM_STATE_ACTIONS = ['HIDE', 'UNHIDE', 'DELETE'] as const;
export const CREATE_STATUSES = ['DRAFT', 'SCHEDULED'] as const;
export const CREATE_APPROVAL_STATUSES = ['PENDING_APPROVAL', 'APPROVED'] as const;
export const SET_APPROVAL_STATUSES = [
  'PENDING_APPROVAL',
  'IN_PROGRESS',
  'APPROVED',
  'REJECTED',
  'NEEDS_WORK',
] as const;

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
/** Caption files (.srt, .vtt) for controls.youtubeCaptionKey; never mediaItems. */
export const CAPTION_MIME_TYPES = ['application/x-subrip', 'text/vtt'] as const;
/** LinkedIn documents (.pdf, .doc, .docx, .ppt, .pptx) for controls.linkedinAttachmentKey; never mediaItems. */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

/**
 * What an upload is for, by MIME type (parameters and case ignored): IMAGE and
 * VIDEO keys go in mediaItems, a CAPTION key in controls.youtubeCaptionKey, a
 * DOCUMENT key in controls.linkedinAttachmentKey. Undefined for a type the
 * upload tools don't take.
 */
export function uploadTypeFor(contentType: string): UploadType | undefined {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const isIn = (list: readonly string[]) => list.includes(mime);
  if (isIn(IMAGE_MIME_TYPES)) return 'IMAGE';
  if (isIn(VIDEO_MIME_TYPES)) return 'VIDEO';
  if (isIn(CAPTION_MIME_TYPES)) return 'CAPTION';
  if (isIn(DOCUMENT_MIME_TYPES)) return 'DOCUMENT';
  return undefined;
}

/** Some MCP clients stringify complex params — parse them back before validation. */
export function jsonParse<T extends z.ZodTypeAny>(schema: T) {
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

/** Optional per-call workspace selector, injected only on the remote binding. */
export const workspaceIdField = z
  .uuid()
  .optional()
  .describe(
    "Target workspace id (from list_workspaces). Omit to use the connection's default workspace.",
  );
