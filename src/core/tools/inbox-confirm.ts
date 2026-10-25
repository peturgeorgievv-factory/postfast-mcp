import { z } from 'zod';
import type { BackendPort } from '../backend-port.js';
import { redeem, sign, type ConfirmAction, type ConfirmFields } from '../confirm-token.js';
import type { ToolAnnotations, ToolDef } from '../tool-def.js';

/** The confirm secret, handed to run() by buildTools() when the host passes confirmGate. */
function secretOf(ctx?: { confirmSecret?: string }): string {
  if (!ctx?.confirmSecret) {
    throw new Error('The confirm gate is not configured on this server.');
  }
  return ctx.confirmSecret;
}

/** One comment operation: the tool that previews it and the tool that carries it out. */
interface CommentOperation {
  action: ConfirmAction;
  itemIdDescription: string;
  /** The text field, for the operations that send text. */
  textDescription?: string;
  preview: { name: string; title: string; description: string; next: string };
  perform: {
    name: string;
    title: string;
    description: string;
    annotations: ToolAnnotations;
    scopes: string[];
    portMethod: keyof BackendPort;
    call: (
      port: BackendPort,
      fields: ConfirmFields,
      workspaceId: string | undefined,
      idempotencyKey: string,
    ) => Promise<unknown>;
  };
}

// A preview changes nothing and calls nothing: it signs a token over exactly what it shows.
const PREVIEW_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

const SAME = 'Must match the preview exactly.';

/**
 * The two tools of one operation. The preview signs the workspace, item,
 * operation and text and calls nothing. The second tool repeats the same
 * values, so the client's approval prompt shows the real reply text, and any
 * change fails the signature; it redeems the token once, then calls the
 * backend with the caller's own credentials, so the backend still decides who
 * may reply or delete. The token's jti goes along as the idempotency key: the
 * used-token list is per process, and a repeat on another replica of the host,
 * or after a timeout that hid a completed send, must not send twice.
 */
function commentOperationTools(op: CommentOperation): ToolDef[] {
  const fieldsOf = (args: Record<string, unknown>, workspaceId?: string): ConfirmFields => ({
    ws: workspaceId,
    itemId: args.itemId as string,
    action: op.action,
    ...(op.textDescription ? { text: args.text as string } : {}),
  });
  return [
    {
      name: op.preview.name,
      binding: 'remote',
      needsConfirmSecret: true,
      title: op.preview.title,
      description: op.preview.description,
      inputSchema: {
        itemId: z.uuid().describe(op.itemIdDescription),
        ...(op.textDescription ? { text: z.string().min(1).describe(op.textDescription) } : {}),
      },
      annotations: PREVIEW_ANNOTATIONS,
      // No backend call, so any token of the connection may preview; the
      // backend checks the operation's scope when the second tool runs.
      scopes: [],
      // Listed only when the port can carry the operation out.
      portMethod: op.perform.portMethod,
      run: async (_port, args, workspaceId, ctx) => {
        const fields = fieldsOf(args, workspaceId);
        if (op.textDescription && !fields.text) throw new Error('text is required.');
        const { confirmToken, expiresAt } = sign(fields, secretOf(ctx));
        return {
          preview: {
            action: op.action,
            itemId: fields.itemId,
            ...(fields.text === undefined ? {} : { text: fields.text }),
            ...(workspaceId === undefined ? {} : { workspaceId }),
          },
          confirmToken,
          expiresAt,
          next: op.preview.next,
        };
      },
    },
    {
      name: op.perform.name,
      binding: 'remote',
      needsConfirmSecret: true,
      title: op.perform.title,
      description: op.perform.description,
      inputSchema: {
        confirmToken: z.string().min(1).describe(`The confirmToken from ${op.preview.name}`),
        itemId: z.uuid().describe(SAME),
        ...(op.textDescription ? { text: z.string().min(1).describe(SAME) } : {}),
      },
      annotations: op.perform.annotations,
      scopes: op.perform.scopes,
      portMethod: op.perform.portMethod,
      run: async (port, args, workspaceId, ctx) => {
        const fields = fieldsOf(args, workspaceId);
        // Reserves the token before the platform call; released only if that call throws.
        const { jti, release } = redeem(args.confirmToken as string, fields, secretOf(ctx));
        try {
          return await op.perform.call(port, fields, workspaceId, `confirm:${jti}`);
        } catch (err) {
          release();
          throw err;
        }
      },
    },
  ];
}

/**
 * Comment replies, Instagram private replies and comment deletions on the
 * remote binding, where they replace reply_to_inbox_item,
 * send_inbox_private_reply and set_inbox_item_state DELETE. Each operation is
 * its own pair of tools with its own schema and annotations, and nothing
 * reaches the platform until the second tool runs with a token from its own
 * preview.
 */
export const inboxConfirmTools: ToolDef[] = [
  ...commentOperationTools({
    action: 'REPLY',
    itemIdDescription: 'The comment item id to reply under (from list_inbox_items)',
    textDescription: "Reply text. Must fit the conversation's maxReplyLength.",
    preview: {
      name: 'preview_comment_reply',
      title: 'Preview Comment Reply',
      description:
        "Preview a public reply to a comment WITHOUT sending it. Pass the comment item's id (from list_inbox_items, not the conversation id) and the reply text, after checking the conversation's canReply and maxReplyLength. Returns a preview and a confirmToken; nothing reaches the platform. Then show the user which comment it is (its author and text) and the exact reply, and wait for their yes in the conversation before calling reply_to_comment, even if they already told you what to write. A reply on Threads can't be removed through PostFast afterwards, so say so in the preview.",
      next: 'Show the user which comment this is (author and text) and the exact reply that will appear publicly under it, and wait for their yes in the conversation, even if they already gave you the text. Only then call reply_to_comment with this confirmToken and the same itemId and text, plus the same workspaceId only if you passed one.',
    },
    perform: {
      name: 'reply_to_comment',
      title: 'Reply to Comment',
      description:
        'Post a public reply under a comment, exactly as previewed with preview_comment_reply. Pass its confirmToken with the same itemId and text (and workspaceId, if you used one); anything different is rejected. Call it only after the user has seen the preview and said yes in the conversation. Replies on Threads can\'t be removed through PostFast. A token expires 15 minutes after the preview and works once. Failures return inbox.* codes (for example replyTooLong, replyNotSupported, rateLimited).',
      // Not destructive: a reply adds a comment and changes nothing that exists.
      // Not declared idempotent: it publishes something new. A repeat of the
      // same token sends once only while the host passes the idempotency key on.
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      scopes: ['inbox:reply'],
      portMethod: 'replyToInboxItem',
      call: (port, { itemId, text }, workspaceId, idempotencyKey) =>
        port.replyToInboxItem!({ itemId, text: text as string, idempotencyKey }, workspaceId),
    },
  }),
  ...commentOperationTools({
    action: 'PRIVATE_REPLY',
    itemIdDescription:
      'The Instagram comment item id to reply privately to (canPrivateReply must be true)',
    textDescription: 'Private reply text (max 1,000 bytes)',
    preview: {
      name: 'preview_private_reply',
      title: 'Preview Instagram Private Reply',
      description:
        "Instagram only: preview a private reply to a comment WITHOUT sending it. It arrives in the commenter's direct messages (possibly in their message requests) and is allowed once per comment, within 7 days of the comment, up to 1,000 bytes; check the comment item's canPrivateReply first (from list_inbox_items). Returns a preview and a confirmToken; nothing is sent. Then show the user which comment it is (its author and text) and the exact message, and wait for their yes in the conversation before calling send_private_reply, even if they already told you what to write.",
      next: "Show the user which comment this is (author and text) and the exact private reply, which arrives in the commenter's direct messages, and wait for their yes in the conversation, even if they already gave you the text. Only then call send_private_reply with this confirmToken and the same itemId and text, plus the same workspaceId only if you passed one.",
    },
    perform: {
      name: 'send_private_reply',
      title: 'Send Instagram Private Reply',
      description:
        "Instagram only: send a private reply to a comment, exactly as previewed with preview_private_reply. Pass its confirmToken with the same itemId and text (and workspaceId, if you used one); anything different is rejected. Call it only after the user has seen the preview and said yes in the conversation. A private reply can't be unsent, and a comment takes only one: a second fails with inbox.privateReplyAlreadySent. A token expires 15 minutes after the preview and works once. Other failures include privateReplyWindowExpired and privateReplyNotSupported.",
      // Not destructive: it sends a new message and changes nothing that exists.
      // Not idempotent, like reply_to_comment.
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      scopes: ['inbox:reply'],
      portMethod: 'sendInboxPrivateReply',
      call: (port, { itemId, text }, workspaceId, idempotencyKey) =>
        port.sendInboxPrivateReply!({ itemId, text: text as string, idempotencyKey }, workspaceId),
    },
  }),
  ...commentOperationTools({
    action: 'DELETE',
    itemIdDescription: 'The comment item id to delete (from list_inbox_items)',
    preview: {
      name: 'preview_comment_deletion',
      title: 'Preview Comment Deletion',
      description:
        "Preview deleting a comment WITHOUT deleting it. Deleting removes the comment from the platform for good; Threads doesn't support it, so offer to hide the comment with set_inbox_item_state instead. Returns a preview and a confirmToken; nothing changes. Then show the user which comment it is (its author and text) and that it will be deleted permanently, and wait for their yes in the conversation before calling delete_comment.",
      next: 'Show the user which comment this is (author and text) and that it will be deleted from the platform for good, and wait for their yes in the conversation. Only then call delete_comment with this confirmToken and the same itemId, plus the same workspaceId only if you passed one.',
    },
    perform: {
      name: 'delete_comment',
      title: 'Delete Comment',
      description:
        "Delete a comment from the platform for good, exactly as previewed with preview_comment_deletion. Pass its confirmToken with the same itemId (and workspaceId, if you used one); anything different is rejected. Call it only after the user has seen the preview and said yes in the conversation. Deleting can't be undone. A token expires 15 minutes after the preview and works once. Failures return inbox.* codes (for example deleteNotSupported on Threads).",
      // Destructive: the comment is removed from the platform for good.
      // Idempotent: deleting a comment that is already gone changes nothing more,
      // so this call needs no idempotency key.
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      scopes: ['inbox:manage'],
      portMethod: 'setInboxItemState',
      call: (port, { itemId }, workspaceId) =>
        port.setInboxItemState!({ itemId, action: 'DELETE' }, workspaceId),
    },
  }),
];
