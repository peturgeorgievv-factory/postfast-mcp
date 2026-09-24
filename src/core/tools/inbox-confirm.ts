import { z } from 'zod';
import { redeem, sign, type ConfirmAction } from '../confirm-token.js';
import type { ToolDef } from '../tool-def.js';

const CONFIRM_ACTIONS = ['REPLY', 'PRIVATE_REPLY', 'DELETE'] as const;

/** The confirm-gate secret, handed to run() by buildTools() when the gate is on. */
function secretOf(ctx?: { confirmSecret?: string }): string {
  if (!ctx?.confirmSecret) {
    throw new Error('The confirm gate is not configured on this server.');
  }
  return ctx.confirmSecret;
}

/**
 * Comment replies, Instagram private replies and comment deletions in two
 * steps, for hosts with the confirm gate on (there they replace
 * reply_to_inbox_item, send_inbox_private_reply and set_inbox_item_state
 * DELETE). prepare returns a preview and a signed token and calls nothing.
 * confirm repeats the same values, so the client's approval prompt for the
 * destructive call shows the real reply text, and any change fails the
 * signature. The token is not tied to a user: confirm runs with the caller's
 * own credentials, so the backend still decides who may reply or delete.
 */
export const inboxConfirmTools: ToolDef[] = [
  {
    name: 'prepare_inbox_action',
    binding: 'remote',
    gatedOnly: true,
    title: 'Prepare Comment Reply or Deletion',
    description:
      "Prepare a reply to a comment, an Instagram private reply, or a comment deletion WITHOUT doing it. REPLY posts publicly under the comment; PRIVATE_REPLY sends an Instagram private reply that arrives as a direct message (one per comment, within 7 days; check the item's canPrivateReply); DELETE removes the comment on the platform permanently (not supported on Threads). Before a reply, check the conversation's canReply and maxReplyLength. Returns a preview and a confirmToken. Show the user the preview and carry it out with confirm_inbox_action only after they agree. Nothing reaches the platform in this step.",
    inputSchema: {
      itemId: z.uuid().describe('The comment item id (from list_inbox_items)'),
      action: z
        .enum(CONFIRM_ACTIONS)
        .describe(
          'REPLY (public, under the comment), PRIVATE_REPLY (Instagram only) or DELETE (permanent)',
        ),
      text: z
        .string()
        .min(1)
        .optional()
        .describe('Reply text. Required for REPLY and PRIVATE_REPLY; omit for DELETE.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    portMethod: 'replyToInboxItem',
    run: async (_port, args, workspaceId, ctx) => {
      const action = args.action as ConfirmAction;
      const itemId = args.itemId as string;
      const text = action === 'DELETE' ? undefined : (args.text as string | undefined);
      if (action !== 'DELETE' && !text) {
        throw new Error('text is required for REPLY and PRIVATE_REPLY.');
      }
      const { confirmToken, expiresAt } = sign(
        { ws: workspaceId, itemId, action, text },
        secretOf(ctx),
      );
      return {
        preview: {
          action,
          itemId,
          ...(text === undefined ? {} : { text }),
          ...(workspaceId === undefined ? {} : { workspaceId }),
        },
        confirmToken,
        expiresAt,
        next: 'Show the user this preview. If they agree, call confirm_inbox_action with this confirmToken and the same itemId, action and text, plus the same workspaceId only if you passed one.',
      };
    },
  },
  {
    name: 'confirm_inbox_action',
    binding: 'remote',
    gatedOnly: true,
    title: 'Confirm Comment Reply or Deletion',
    description:
      'Carry out a reply or deletion prepared with prepare_inbox_action. Pass its confirmToken with the same itemId, action and text (and workspaceId, if you used one); anything different is rejected. Call it only after the user has agreed to the preview. Replies on Threads cannot be removed through PostFast, private replies cannot be unsent, and deletions cannot be undone. A token expires 15 minutes after it was prepared and works once. Failures return the underlying inbox.* codes (for example replyTooLong, privateReplyAlreadySent, deleteNotSupported).',
    inputSchema: {
      confirmToken: z.string().min(1).describe('The confirmToken from prepare_inbox_action'),
      itemId: z.uuid().describe('Must match the prepared action exactly.'),
      action: z.enum(CONFIRM_ACTIONS).describe('Must match the prepared action exactly.'),
      text: z.string().min(1).optional().describe('Must match the prepared action exactly.'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    portMethod: 'replyToInboxItem',
    run: async (port, args, workspaceId, ctx) => {
      const action = args.action as ConfirmAction;
      const itemId = args.itemId as string;
      const text = action === 'DELETE' ? undefined : (args.text as string | undefined);
      // Reserves the token before the platform call; released only if that call throws.
      const release = redeem(
        args.confirmToken as string,
        { ws: workspaceId, itemId, action, text },
        secretOf(ctx),
      );
      try {
        if (action === 'REPLY') {
          return await port.replyToInboxItem!({ itemId, text: text as string }, workspaceId);
        }
        if (action === 'PRIVATE_REPLY') {
          return await port.sendInboxPrivateReply!(
            { itemId, text: text as string },
            workspaceId,
          );
        }
        return await port.setInboxItemState!({ itemId, action: 'DELETE' }, workspaceId);
      } catch (err) {
        release();
        throw err;
      }
    },
  },
];
