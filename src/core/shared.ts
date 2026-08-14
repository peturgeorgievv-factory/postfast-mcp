import { z } from 'zod';

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
