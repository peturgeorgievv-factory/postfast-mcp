import { z } from 'zod';
import type {
  AssignInboxConversationArgs,
  InboxReplyArgs,
  ListInboxConversationsArgs,
  ListInboxItemsArgs,
  SetInboxConversationStatusArgs,
  SetInboxItemStateArgs,
} from '../backend-port.js';
import {
  INBOX_CONVERSATION_STATUSES,
  INBOX_ITEM_STATE_ACTIONS,
  PLATFORMS,
} from '../shared.js';
import type { ToolDef } from '../tool-def.js';

/**
 * Social inbox — a COMMENTS inbox (comments on the workspace's own posts;
 * never described as DMs/messages). Coverage: TikTok, Instagram, Facebook
 * Pages, Threads — per account, `inboxCapable` from list_accounts is the
 * authority on what is live today. Reply capability is server-computed per
 * conversation (canReply / maxReplyLength / windowState / disabledReason) —
 * descriptions steer models to render from those fields, never platform rules.
 * Every def carries portMethod so bindings whose adapter predates this wave
 * skip these tools instead of shipping broken ones.
 */
export const inboxTools: ToolDef[] = [
  {
    name: 'list_inbox_conversations',
    binding: 'both',
    title: 'List Inbox Conversations',
    description:
      "List comment conversations from the social inbox — comments on your connected accounts' posts, grouped per post, newest activity first. Covers TikTok, Instagram, Facebook Pages, and Threads; an account's inboxCapable flag (from list_accounts) tells you whether comments can flow for it today. Comments arrive within seconds of being posted and only from connect/launch onward (no history backfill). Each conversation carries a server-computed reply capability — canReply, maxReplyLength, windowState, disabledReason — plus unreadCount, status (OPEN | SNOOZED | CLOSED), and assignedToUserId. ALWAYS derive whether and how long you can reply from those fields; never assume platform rules. postPreview carries the post's caption and, when available, its public permalink — use the permalink to link the user to the post on the platform (null on Instagram for now).",
    inputSchema: {
      page: z.number().int().min(0).default(0).describe('Page number (0-based)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Conversations per page (max 50)'),
      platforms: z.array(z.enum(PLATFORMS)).optional().describe('Filter by platforms'),
      socialMediaIds: z
        .array(z.uuid())
        .optional()
        .describe('Filter by specific social media account ids (from list_accounts)'),
      statuses: z
        .array(z.enum(INBOX_CONVERSATION_STATUSES))
        .optional()
        .describe('Filter by conversation statuses'),
      unreadOnly: z
        .boolean()
        .optional()
        .describe('Only conversations with unread comments'),
      assignedToUserId: z
        .uuid()
        .optional()
        .describe('Only conversations assigned to this workspace member'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    portMethod: 'listInboxConversations',
    run: (port, args, workspaceId) =>
      port.listInboxConversations!(
        args as unknown as ListInboxConversationsArgs,
        workspaceId,
      ),
  },
  {
    name: 'get_inbox_conversation',
    binding: 'both',
    title: 'Get Inbox Conversation',
    description:
      "Fetch one inbox conversation by id, including its server-computed reply capability (canReply, maxReplyLength, windowState, disabledReason) — derive reply ability from these fields, never from hardcoded platform rules. postPreview carries the post's caption and, when available, its public permalink — use the permalink to link the user to the post on the platform (null on Instagram for now). Returns null when the conversation does not exist in the workspace.",
    inputSchema: {
      id: z.uuid().describe('Conversation id (from list_inbox_conversations)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    portMethod: 'getInboxConversation',
    run: (port, args, workspaceId) =>
      port.getInboxConversation!(args.id as string, workspaceId),
  },
  {
    name: 'list_inbox_items',
    binding: 'both',
    title: 'List Inbox Items',
    description:
      'List the items of one inbox conversation — the comments and the replies sent to them — oldest first by default (order=DESC for newest first). Items carry direction (INBOUND | OUTBOUND), state (VISIBLE | HIDDEN | DELETED), author info, and on Instagram comments canPrivateReply (eligibility for send_inbox_private_reply). Replies sent from PostFast appear exactly once — no duplicates when the platform reports them back.',
    inputSchema: {
      conversationId: z
        .uuid()
        .describe('Conversation id (from list_inbox_conversations)'),
      page: z.number().int().min(0).default(0).describe('Page number (0-based)'),
      limit: z.number().int().min(1).max(50).default(20).describe('Items per page (max 50)'),
      order: z
        .enum(['ASC', 'DESC'])
        .optional()
        .describe('Sort by comment time. Default ASC (oldest first); DESC for newest first.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    portMethod: 'listInboxItems',
    run: (port, args, workspaceId) =>
      port.listInboxItems!(args as unknown as ListInboxItemsArgs, workspaceId),
  },
  {
    name: 'get_inbox_unread_count',
    binding: 'both',
    title: 'Get Inbox Unread Count',
    description:
      'Total unread comment count across all inbox conversations in the workspace (the sum of per-conversation unreadCount). Use mark_inbox_conversation_read after presenting a conversation to the user.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    portMethod: 'getInboxUnreadCount',
    run: (port, _args, workspaceId) => port.getInboxUnreadCount!(workspaceId),
  },
  {
    name: 'reply_to_inbox_item',
    binding: 'both',
    title: 'Reply to Inbox Comment',
    description:
      "Reply publicly UNDER a specific comment — pass the comment item's id (from list_inbox_items), not the conversation id. BEFORE replying, check the conversation's canReply and maxReplyLength and stay within them; the caps are per platform (TikTok 1,200, Instagram 2,200, Facebook 8,000, Threads 500 characters) but the server-computed fields are authoritative — never assume. Failures return inbox.* codes (e.g. replyTooLong, replyNotSupported, rateLimited).",
    inputSchema: {
      itemId: z.uuid().describe('The comment item id to reply under (from list_inbox_items)'),
      text: z.string().min(1).describe("Reply text. Must fit the conversation's maxReplyLength."),
    },
    // destructive: publishes a public comment; Threads exposes no delete verb, so a
    // reply there cannot be removed through our API.
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    portMethod: 'replyToInboxItem',
    run: (port, args, workspaceId) =>
      port.replyToInboxItem!(args as unknown as InboxReplyArgs, workspaceId),
  },
  {
    name: 'send_inbox_private_reply',
    binding: 'both',
    title: 'Send Instagram Private Reply',
    description:
      "Instagram only: send ONE private reply to a comment — it arrives as a direct message to the commenter and may land in their Message Requests folder. Allowed once per comment, within 7 days of the comment, up to 1,000 bytes (emoji and non-Latin text count multi-byte — roughly 1,000 characters, less with emoji). Check the item's canPrivateReply first (from list_inbox_items). A second attempt on the same comment fails with inbox.privateReplyAlreadySent; other failures include privateReplyWindowExpired and privateReplyNotSupported.",
    inputSchema: {
      itemId: z
        .uuid()
        .describe('The Instagram comment item id to reply privately to (canPrivateReply must be true)'),
      text: z.string().min(1).describe('Private reply text (max 1,000 bytes)'),
    },
    // destructive: sends a real direct message with no unsend path, and the
    // once-per-comment guard means the attempt cannot be repeated.
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    portMethod: 'sendInboxPrivateReply',
    run: (port, args, workspaceId) =>
      port.sendInboxPrivateReply!(args as unknown as InboxReplyArgs, workspaceId),
  },
  {
    name: 'set_inbox_item_state',
    binding: 'both',
    title: 'Moderate Inbox Comment',
    description:
      'Moderate a comment on the platform: HIDE hides it from the public, UNHIDE restores it, DELETE removes the comment on the platform — cannot be undone. HIDE/UNHIDE work on TikTok, Instagram, Facebook, and Threads; DELETE is not supported on Threads (inbox.deleteNotSupported). State changes made on the platform itself sync back to the inbox automatically.',
    inputSchema: {
      itemId: z.uuid().describe('The comment item id (from list_inbox_items)'),
      action: z
        .enum(INBOX_ITEM_STATE_ACTIONS)
        .describe('HIDE, UNHIDE, or DELETE (DELETE is irreversible)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    portMethod: 'setInboxItemState',
    run: (port, args, workspaceId) =>
      port.setInboxItemState!(args as unknown as SetInboxItemStateArgs, workspaceId),
  },
  {
    name: 'mark_inbox_conversation_read',
    binding: 'both',
    title: 'Mark Inbox Conversation Read',
    description:
      "Mark one conversation read (zeroes its unreadCount). Do this after presenting a conversation's comments to the user. Internal to PostFast — nothing changes on the platform.",
    inputSchema: {
      conversationId: z
        .uuid()
        .describe('Conversation id (from list_inbox_conversations)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    portMethod: 'markInboxConversationRead',
    run: (port, args, workspaceId) =>
      port.markInboxConversationRead!(args.conversationId as string, workspaceId),
  },
  {
    name: 'set_inbox_conversation_status',
    binding: 'both',
    title: 'Set Inbox Conversation Status',
    description:
      'Triage a conversation: set its status to OPEN, SNOOZED, or CLOSED. Internal to PostFast — nothing changes on the platform.',
    inputSchema: {
      conversationId: z
        .uuid()
        .describe('Conversation id (from list_inbox_conversations)'),
      status: z.enum(INBOX_CONVERSATION_STATUSES).describe('New conversation status'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    portMethod: 'setInboxConversationStatus',
    run: (port, args, workspaceId) =>
      port.setInboxConversationStatus!(
        args as unknown as SetInboxConversationStatusArgs,
        workspaceId,
      ),
  },
  {
    name: 'assign_inbox_conversation',
    binding: 'both',
    title: 'Assign Inbox Conversation',
    description:
      'Assign a conversation to a workspace member for follow-up, or omit assigneeUserId to unassign. The assignee must be a member of the workspace (inbox.assigneeNotMember otherwise). Internal to PostFast — nothing changes on the platform.',
    inputSchema: {
      conversationId: z
        .uuid()
        .describe('Conversation id (from list_inbox_conversations)'),
      assigneeUserId: z
        .uuid()
        .optional()
        .describe('Workspace member user id to assign. Omit to unassign.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    portMethod: 'assignInboxConversation',
    run: (port, args, workspaceId) =>
      port.assignInboxConversation!(
        args as unknown as AssignInboxConversationArgs,
        workspaceId,
      ),
  },
];
