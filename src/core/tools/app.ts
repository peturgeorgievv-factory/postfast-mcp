import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { APP_ICON, appToolMeta, type AppOptions } from '../app.js';
import type { AppActionArgs, AppPostArgs, BackendPort } from '../backend-port.js';
import type { ToolDef } from '../tool-def.js';
import type {
  AppAccount,
  AppCalendar,
  AppCalendarAccount,
  AppCalendarPost,
  AppCalendarView,
  AppEntrypoint,
  AppPost,
  AppPostDetailView,
} from '../types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// The view shows 2 days back to 14 ahead in the viewer's time zone and trims
// to local days; one extra day each side covers every time zone.
const WINDOW_BACK_DAYS = 3;
const WINDOW_AHEAD_DAYS = 15;
const POSTS_LIMIT = 100;
const DRAFTS_LIMIT = 20;
/** Captions are cut here; the view clamps them to three lines. */
const CAPTION_CHARS = 280;
/** An opened post shows its full text up to here (Facebook allows about 63,000). */
const FULL_TEXT_CHARS = 20_000;
/** Result size ceiling, far below the 150,000-character limit (see fitBudget). */
const RESULT_BUDGET_CHARS = 100_000;

const APP_ACTIONS = [
  'open_in_postfast',
  'review_in_chat',
  'reconnect',
  'connect_account',
  'new_post_started',
] as const;

/** The posts page tab that lists each status; everything else is on "scheduled". */
const POSTS_TAB: Record<string, string> = {
  DRAFT: 'draft',
  FAILED: 'failed',
  PUBLISHED: 'published',
};

function postsUrl(app: AppOptions, params: Record<string, string>): string {
  return `${app.webAppUrl}/dashboard/posts?${new URLSearchParams(params)}`;
}

function toAccount(account: AppCalendarAccount): AppAccount {
  return {
    id: account.id,
    platform: account.platform,
    handle: account.platformUsername || account.displayName || null,
    connectionStatus: account.connectionStatus,
    disabledReason: account.disabledReason ?? null,
    avatarUrl: account.avatarUrl ?? null,
  };
}

/** The text cut to `max` characters, ending in an ellipsis when cut. */
function shorten(text: string | null | undefined, max: number): { text: string; truncated: boolean } {
  const value = text ?? '';
  return value.length > max
    ? { text: `${value.slice(0, max - 1).trimEnd()}…`, truncated: true }
    : { text: value, truncated: false };
}

function openUrlFor(app: AppOptions, post: { id: string; status: string }, workspaceId?: string): string {
  return postsUrl(app, {
    tab: POSTS_TAB[post.status] ?? 'scheduled',
    editPostId: post.id,
    ...(workspaceId ? { workspaceId } : {}),
  });
}

function toPost(post: AppCalendarPost, app: AppOptions, workspaceId: string): AppPost {
  const { text, truncated } = shorten(post.content, CAPTION_CHARS);
  return {
    ...post,
    content: text,
    contentTruncated: truncated,
    openUrl: openUrlFor(app, post, workspaceId),
  };
}

const overBudget = (view: AppCalendarView) =>
  JSON.stringify(view).length > RESULT_BUDGET_CHARS;

/**
 * Keeps the view under the budget, giving up the least useful data first:
 * avatars of accounts without a listed post, then every avatar, then posts
 * from the far end (the latest dated post or the oldest draft) with hasMore set.
 */
function fitBudget(view: AppCalendarView): AppCalendarView {
  if (!overBudget(view)) return view;
  const listed = new Set([...view.posts, ...view.drafts].map((p) => p.socialMediaId));
  for (const account of view.accounts) if (!listed.has(account.id)) account.avatarUrl = null;
  if (!overBudget(view)) return view;
  for (const account of view.accounts) account.avatarUrl = null;
  while (overBudget(view) && (view.posts.length || view.drafts.length)) {
    if (view.posts.length >= view.drafts.length) {
      view.posts.pop();
      view.hasMore = true;
    } else {
      view.drafts.pop();
      view.draftsHasMore = true;
    }
  }
  return view;
}

/** Fails loudly on a payload the view could not render, instead of showing an empty calendar. */
function assertCalendar(calendar: AppCalendar): void {
  const ok =
    calendar &&
    typeof calendar.workspace?.id === 'string' &&
    Array.isArray(calendar.accounts) &&
    Array.isArray(calendar.posts) &&
    Array.isArray(calendar.drafts);
  if (!ok) throw new Error('The calendar could not be loaded: unexpected response from PostFast.');
}

async function loadCalendar(
  port: BackendPort,
  entrypoint: AppEntrypoint,
  args: Record<string, unknown>,
  workspaceId: string | undefined,
  app: AppOptions | undefined,
): Promise<AppCalendarView> {
  if (!app || !port.getAppCalendar) {
    throw new Error('The PostFast calendar is not available on this connection.');
  }
  const now = Date.now();
  const window = {
    from: new Date(now - WINDOW_BACK_DAYS * DAY_MS).toISOString(),
    to: new Date(now + WINDOW_AHEAD_DAYS * DAY_MS).toISOString(),
  };
  const calendar = await port.getAppCalendar(
    {
      ...window,
      limit: POSTS_LIMIT,
      draftsLimit: DRAFTS_LIMIT,
      entrypoint,
      refresh: args.refresh === true,
    },
    workspaceId,
  );
  assertCalendar(calendar);
  const ws = calendar.workspace;
  return fitBudget({
    version: 1,
    entrypoint,
    generatedAt: new Date(now).toISOString(),
    window,
    workspace: { id: ws.id, name: ws.name },
    accounts: calendar.accounts.map(toAccount),
    posts: calendar.posts.map((post) => toPost(post, app, ws.id)),
    drafts: calendar.drafts.map((post) => toPost(post, app, ws.id)),
    hasMore: calendar.hasMore === true,
    draftsHasMore: calendar.draftsHasMore === true,
    links: {
      posts: postsUrl(app, { workspaceId: ws.id }),
      accounts: `${app.webAppUrl}/dashboard/accounts`,
    },
  });
}

/**
 * The view gets everything in `_meta`, which stays out of the model's context,
 * so the signed media URLs never reach it. The text and structuredContent
 * carry counts only.
 */
function calendarResult(data: unknown): CallToolResult {
  const view = data as AppCalendarView;
  const counts = {
    posts: view.posts.length,
    drafts: view.drafts.length,
    failed: view.posts.filter((p) => p.status === 'FAILED').length,
    pendingApproval: [...view.posts, ...view.drafts].filter(
      (p) => p.approvalStatus === 'PENDING_APPROVAL' && p.status !== 'PUBLISHED',
    ).length,
  };
  return {
    content: [
      {
        type: 'text',
        text: `Opened the PostFast calendar for ${view.workspace.name}: ${counts.posts} posts from ${view.window.from.slice(0, 10)} to ${view.window.to.slice(0, 10)} and ${counts.drafts} drafts without a date.`,
      },
    ],
    structuredContent: { window: view.window, ...counts, hasMore: view.hasMore },
    _meta: { 'postfast/calendar': view },
  };
}

async function loadPost(
  port: BackendPort,
  args: Record<string, unknown>,
  workspaceId: string | undefined,
  app: AppOptions | undefined,
): Promise<AppPostDetailView> {
  if (!app || !port.getAppPost) {
    throw new Error('Post details are not available on this connection.');
  }
  const post = await port.getAppPost(args as unknown as AppPostArgs, workspaceId);
  if (!post || typeof post.id !== 'string' || !Array.isArray(post.mediaItems)) {
    throw new Error('The post could not be loaded: unexpected response from PostFast.');
  }
  const { text, truncated } = shorten(post.content, FULL_TEXT_CHARS);
  return {
    ...post,
    content: text,
    contentTruncated: truncated,
    openUrl: openUrlFor(app, post, post.workspaceId),
  };
}

/** Like the calendar: the post goes to the view in `_meta`; the model sees ids only. */
function postResult(data: unknown): CallToolResult {
  const post = data as AppPostDetailView;
  return {
    content: [{ type: 'text', text: `Opened post ${post.id} in the PostFast calendar.` }],
    structuredContent: { postId: post.id, mediaCount: post.mediaItems.length },
    _meta: { 'postfast/post': post },
  };
}

const refreshField = z
  .boolean()
  .optional()
  .describe('True when the open calendar reloads its data; omitted when it opens.');

const calendarTool = (
  name: string,
  title: string,
  entrypoint: AppEntrypoint,
  description: string,
): ToolDef => ({
  name,
  binding: 'remote',
  appOnly: true,
  title,
  description,
  inputSchema: { refresh: refreshField },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  icons: [APP_ICON],
  _meta: appToolMeta(entrypoint),
  portMethod: 'getAppCalendar',
  run: (port, args, workspaceId, ctx) => loadCalendar(port, entrypoint, args, workspaceId, ctx?.app),
  toResult: calendarResult,
});

const READ_ONLY_NOTE =
  'Read-only: the calendar never approves, publishes, replies to or deletes anything; those go through the conversation.';

/**
 * The calendar app: a sidebar entrypoint, a conversation-tab entrypoint, the
 * view's post details and its analytics call. Present only when the host passes
 * BuildToolsOptions.app; every tool is hidden from the model.
 */
export const appTools: ToolDef[] = [
  calendarTool(
    'open_postfast',
    'Content Calendar',
    'global',
    `Opens the PostFast content calendar: posts from the last 2 days through the next 14, grouped by day, drafts without a date, and a filter by account. ${READ_ONLY_NOTE}`,
  ),
  calendarTool(
    'postfast_tab',
    'PostFast Calendar',
    'thread',
    `Opens the PostFast calendar in a tab beside this conversation: the same posts, drafts and account filter as the sidebar calendar. ${READ_ONLY_NOTE}`,
  ),
  {
    name: 'get_calendar_post',
    binding: 'remote',
    appOnly: true,
    title: 'Calendar Post Details',
    description:
      'Called by the PostFast calendar when a post is opened: its full text, first comment and every image or video. Read-only.',
    inputSchema: {
      postId: z.uuid().describe('The post to open, from the calendar.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: appToolMeta(),
    portMethod: 'getAppPost',
    run: (port, args, workspaceId, ctx) => loadPost(port, args, workspaceId, ctx?.app),
    toResult: postResult,
  },
  {
    name: 'record_app_action',
    binding: 'remote',
    appOnly: true,
    title: 'Record Calendar Action',
    description:
      'Called by the PostFast calendar to record which of its buttons was used (open in PostFast, review in chat, reconnect, connect an account, new post), for product analytics. Changes no posts, accounts or settings.',
    inputSchema: {
      action: z.enum(APP_ACTIONS).describe('The button that was used.'),
      entrypoint: z
        .enum(['global', 'thread'])
        .optional()
        .describe('Where the calendar was opened: the sidebar (global) or a conversation tab (thread).'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    _meta: appToolMeta(),
    portMethod: 'recordAppAction',
    run: async (port, args, workspaceId) => {
      if (!port.recordAppAction) throw new Error('Not available on this connection.');
      await port.recordAppAction(args as unknown as AppActionArgs, workspaceId);
      return { recorded: true };
    },
  },
];
