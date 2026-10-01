import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { OpenAIExtensions } from '@openai/mcp-extensions/app';
import '@openai/mcp-extensions/app/styles.css';
import './styles.css';
import type {
  AppAccount,
  AppAction,
  AppCalendarView,
  AppMediaItem,
  AppPost,
  AppPostDetailView,
} from '../../src/core/types.js';
import { h, safeUrl, type Child } from './dom';
import {
  dateToWallTime,
  dayKey,
  daysBetween,
  dayTitle,
  formatPostTime,
  parseDate,
  resolveLocale,
  resolveTimeZone,
  wallTimeToDate,
} from './format';
import { glyph, logoMark, platformGlyph, platformName, type GlyphName } from './icons';

const CALENDAR_META_KEY = 'postfast/calendar';
const POST_META_KEY = 'postfast/post';
const ENTRY_TOOLS = { global: 'open_postfast', thread: 'postfast_tab' } as const;
/** Signed media URLs expire after 15 minutes; reload a little before. */
const STALE_MS = 12 * 60 * 1000;
const SLOW_LOAD_MS = 15_000;
const NOTICE_MS = 6_000;
const DAYS_BACK = 2;
const DAYS_AHEAD = 14;
const MAX_TEXT = 5_000;

type Tone = 'success' | 'error' | 'info';

/** An opened post: the card's data at once, the full post once it loads. */
interface DetailState {
  post: AppPost;
  full?: AppPostDetailView;
  loading: boolean;
  error?: string;
  /** Loaded through list_posts on a host without post details: full text, first image only. */
  partial?: boolean;
}

interface ComposeState {
  accountIds: Set<string>;
  text: string;
  when: string;
  error?: string;
  sending: boolean;
}

const state = {
  status: 'loading' as 'loading' | 'ready' | 'error',
  error: '',
  slow: false,
  view: undefined as AppCalendarView | undefined,
  loadedAt: 0,
  refreshing: false,
  page: 'calendar' as 'calendar' | 'compose' | 'post',
  detail: undefined as DetailState | undefined,
  calendarScrollY: 0,
  restoreScroll: undefined as number | undefined,
  filter: 'all',
  pending: new Set<string>(),
  notice: undefined as { tone: Tone; text: string } | undefined,
  compose: emptyCompose(),
  scrollToToday: true,
  scrollToTop: false,
};

function emptyCompose(): ComposeState {
  return { accountIds: new Set(), text: '', when: '', sending: false };
}

let host: McpUiHostContext = {};
let appliedFonts = '';
let slowTimer: ReturnType<typeof setTimeout> | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

const timeZone = () => resolveTimeZone(host.timeZone);
const locale = () => resolveLocale(host.locale);

const app = new App({ name: 'PostFast Calendar', version: '1.0.0' });
// Created before connect(): it hooks the handshake to apply the host's pointer style.
const openai = new OpenAIExtensions(app);

// Registered before connect() so the entrypoint's own result renders first,
// without calling the tool again.
app.ontoolresult = (result) => acceptResult(result as CallToolResult, false);
app.ontoolcancelled = () => {
  if (!state.view) fail('Loading the calendar was cancelled.');
};
app.onhostcontextchanged = () => {
  applyHost();
  render();
};
app.onteardown = async () => ({});

// ---------------------------------------------------------------------------
// Host, data and errors

function applyHost(): void {
  host = app.getHostContext() ?? {};
  if (host.theme) applyDocumentTheme(host.theme);
  if (host.styles?.variables) applyHostStyleVariables(host.styles.variables);
  const fonts = host.styles?.css?.fonts;
  if (fonts && fonts !== appliedFonts) {
    applyHostFonts(fonts);
    appliedFonts = fonts;
  }
  const root = document.documentElement.style;
  const insets = host.safeAreaInsets;
  root.setProperty('--safe-top', `${insets?.top ?? 0}px`);
  root.setProperty('--safe-right', `${insets?.right ?? 0}px`);
  root.setProperty('--safe-bottom', `${insets?.bottom ?? 0}px`);
  root.setProperty('--safe-left', `${insets?.left ?? 0}px`);
}

const messageOf = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : String(err ?? 'Unknown error');

function textOf(result: CallToolResult | undefined): string {
  const block = result?.content?.find((c) => c.type === 'text');
  return block && 'text' in block ? block.text : '';
}

function isCalendarView(value: unknown): value is AppCalendarView {
  const v = value as AppCalendarView | undefined;
  return (
    !!v &&
    v.version === 1 &&
    typeof v.workspace?.id === 'string' &&
    Array.isArray(v.accounts) &&
    Array.isArray(v.posts) &&
    Array.isArray(v.drafts)
  );
}

/**
 * Takes a tool result. A failed refresh keeps the calendar on screen and
 * reports the error in a notice; a failed first load shows the error page.
 */
function acceptResult(result: CallToolResult | undefined, keepOnError: boolean): void {
  clearTimeout(slowTimer);
  const reject = (message: string) => {
    if (keepOnError && state.view) notify('error', message);
    else fail(message);
  };
  if (!result || result.isError) {
    reject(textOf(result) || 'PostFast could not load the calendar.');
    return;
  }
  const view = (result._meta as Record<string, unknown> | undefined)?.[CALENDAR_META_KEY];
  if (!isCalendarView(view)) {
    reject('The calendar received data it cannot show. Try again in a moment.');
    return;
  }
  state.view = view;
  state.loadedAt = Date.now();
  state.status = 'ready';
  state.error = '';
  state.slow = false;
  if (state.filter !== 'all' && !view.accounts.some((a) => a.id === state.filter)) {
    state.filter = 'all';
  }
  render();
}

function fail(message: string): void {
  clearTimeout(slowTimer);
  state.status = 'error';
  state.error = message;
  state.slow = false;
  render();
}

function notify(tone: Tone, text: string): void {
  clearTimeout(noticeTimer);
  state.notice = { tone, text };
  noticeTimer = setTimeout(() => {
    state.notice = undefined;
    render();
  }, NOTICE_MS);
  render();
}

/** The tool that opened this view; a refresh calls the same one. */
function entryTool(): string {
  if (state.view) return ENTRY_TOOLS[state.view.entrypoint] ?? ENTRY_TOOLS.global;
  return host.toolInfo?.tool?.name === ENTRY_TOOLS.thread ? ENTRY_TOOLS.thread : ENTRY_TOOLS.global;
}

async function reload(kind: 'refresh' | 'retry'): Promise<void> {
  if (state.refreshing) return;
  state.refreshing = true;
  if (kind === 'retry' && !state.view) {
    state.status = 'loading';
    state.error = '';
  }
  render();
  try {
    const args: Record<string, unknown> = kind === 'refresh' ? { refresh: true } : {};
    if (state.view) args.workspaceId = state.view.workspace.id;
    acceptResult(await app.callServerTool({ name: entryTool(), arguments: args }), true);
  } catch (err) {
    const message = `Couldn't reach PostFast: ${messageOf(err)}`;
    if (state.view) notify('error', message);
    else fail(message);
  } finally {
    state.refreshing = false;
    render();
  }
}

/** Reloads when the signed media links are about to expire. */
function refreshIfStale(): void {
  if (state.view && !state.refreshing && Date.now() - state.loadedAt > STALE_MS) {
    void reload('refresh');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshIfStale();
});

/** Product analytics through the backend; failures are ignored and never shown. */
function record(action: AppAction): void {
  const view = state.view;
  const args: Record<string, unknown> = { action };
  if (view) {
    args.entrypoint = view.entrypoint;
    args.workspaceId = view.workspace.id;
  }
  app.callServerTool({ name: 'record_app_action', arguments: args }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Actions. None of them changes a post: approving, publishing and editing go
// through the conversation, where the user confirms.

async function openExternal(url: string | null | undefined): Promise<boolean> {
  const safe = safeUrl(url);
  if (!safe) {
    notify('error', 'That link is not valid.');
    return false;
  }
  try {
    const result = await app.openLink({ url: safe });
    if (result?.isError) {
      notify('error', 'The link could not be opened.');
      return false;
    }
    return true;
  } catch (err) {
    notify('error', `The link could not be opened: ${messageOf(err)}`);
    return false;
  }
}

function openInPostFast(url: string): void {
  record('open_in_postfast');
  void openExternal(url);
}

/** Inline hosts that offer fullscreen get an Expand button; entrypoints already open fullscreen. */
const canExpand = () =>
  host.displayMode === 'inline' && !!host.availableDisplayModes?.includes('fullscreen');

async function expand(): Promise<void> {
  try {
    await app.requestDisplayMode({ mode: 'fullscreen' });
  } catch (err) {
    notify('error', `Couldn't expand the calendar: ${messageOf(err)}`);
  }
}

function connectAccount(): void {
  record('connect_account');
  void openExternal(state.view?.links.accounts);
}

async function withPending(key: string, task: () => Promise<void>): Promise<void> {
  if (state.pending.has(key)) return;
  state.pending.add(key);
  render();
  try {
    await task();
  } finally {
    state.pending.delete(key);
    render();
  }
}

function reviewInChat(post: AppPost): Promise<void> {
  return withPending(`review:${post.id}`, async () => {
    const account = accountOf(post);
    const when = parseDate(post.scheduledAt);
    const tz = timeZone();
    const text =
      `Show me my PostFast post ${post.id}` +
      (account ? ` on ${accountLabel(account)}` : '') +
      (when ? `, scheduled for ${formatPostTime(when, tz, locale())} (${tz})` : '') +
      ", with its full text and media, and ask whether I approve it. Don't approve or change it until I say yes.";
    try {
      const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
      if (result?.isError) {
        notify('error', 'The conversation did not accept the message.');
        return;
      }
      record('review_in_chat');
      notify('success', 'Sent to the conversation.');
    } catch (err) {
      notify('error', `The message could not be sent: ${messageOf(err)}`);
    }
  });
}

function connectUrlOf(result: CallToolResult): string | null {
  const structured = (result.structuredContent as { connectUrl?: unknown } | undefined)?.connectUrl;
  if (typeof structured === 'string') return safeUrl(structured);
  try {
    return safeUrl((JSON.parse(textOf(result)) as { connectUrl?: unknown }).connectUrl);
  } catch {
    return null;
  }
}

function reconnect(account: AppAccount): Promise<void> {
  return withPending(`reconnect:${account.id}`, async () => {
    record('reconnect');
    try {
      const result = await app.callServerTool({
        name: 'generate_connect_link',
        arguments: {
          platforms: [account.platform],
          expiryDays: 1,
          sendEmail: false,
          ...(state.view ? { workspaceId: state.view.workspace.id } : {}),
        },
      });
      if (result.isError) {
        notify('error', textOf(result) || 'PostFast could not create a reconnect link.');
        return;
      }
      const url = connectUrlOf(result);
      if (!url) {
        notify('error', 'PostFast returned no reconnect link.');
        return;
      }
      if (await openExternal(url)) {
        notify('info', `Reconnect ${platformName(account.platform)} in the page that opened, then refresh.`);
      }
    } catch (err) {
      notify('error', `Couldn't reach PostFast: ${messageOf(err)}`);
    }
  });
}

function openPost(post: AppPost): void {
  state.calendarScrollY = window.scrollY;
  state.detail = { post, loading: true };
  state.page = 'post';
  state.scrollToTop = true;
  render();
  document.getElementById('post-back')?.focus({ preventScroll: true });
  void loadDetail(post);
}

function closePost(): void {
  const id = state.detail?.post.id;
  state.page = 'calendar';
  state.detail = undefined;
  state.restoreScroll = state.calendarScrollY;
  render();
  if (id) document.getElementById(`view-${id}`)?.focus({ preventScroll: true });
}

const isToolMissing = (message: string) => /tool get_calendar_post not found/i.test(message);

function isPostDetail(value: unknown, id: string): value is AppPostDetailView {
  const v = value as AppPostDetailView | undefined;
  return !!v && v.id === id && typeof v.content === 'string' && Array.isArray(v.mediaItems);
}

/** Applies a load result only if that post is still the one on screen. */
function settleDetail(post: AppPost, update: Partial<DetailState>): void {
  if (state.page !== 'post' || state.detail?.post.id !== post.id) return;
  state.detail = { ...state.detail, ...update, loading: false };
  render();
}

async function loadDetail(post: AppPost): Promise<void> {
  const args: Record<string, unknown> = { postId: post.id };
  if (state.view) args.workspaceId = state.view.workspace.id;
  let result: CallToolResult;
  try {
    result = await app.callServerTool({ name: 'get_calendar_post', arguments: args });
  } catch (err) {
    if (isToolMissing(messageOf(err))) return loadDetailFromList(post);
    return settleDetail(post, { error: `Couldn't reach PostFast: ${messageOf(err)}` });
  }
  if (result.isError) {
    const message = textOf(result);
    if (isToolMissing(message)) return loadDetailFromList(post);
    return settleDetail(post, { error: message || 'PostFast could not load this post.' });
  }
  const full = (result._meta as Record<string, unknown> | undefined)?.[POST_META_KEY];
  if (!isPostDetail(full, post.id)) {
    return settleDetail(post, { error: 'The post came back in a form the calendar cannot show.' });
  }
  settleDetail(post, { full, error: undefined });
}

/** Hosts without post details: the full text through list_posts, the card's first image. */
async function loadDetailFromList(post: AppPost): Promise<void> {
  try {
    const args: Record<string, unknown> = { ids: [post.id], limit: 1 };
    if (state.view) args.workspaceId = state.view.workspace.id;
    const result = await app.callServerTool({ name: 'list_posts', arguments: args });
    if (result.isError) throw new Error(textOf(result) || 'PostFast could not load this post.');
    const rows = (result.structuredContent as { data?: unknown } | undefined)?.data;
    const row = Array.isArray(rows)
      ? (rows as { id?: string; content?: string; firstComment?: string | null }[]).find((r) => r.id === post.id)
      : undefined;
    if (!row) throw new Error('This post is no longer in PostFast.');
    const full: AppPostDetailView = {
      ...post,
      workspaceId: state.view?.workspace.id ?? '',
      content: row.content ?? post.content,
      contentTruncated: false,
      firstComment: row.firstComment ?? null,
      mediaItems: post.thumbnail ? [post.thumbnail] : [],
    };
    settleDetail(post, { full, partial: true, error: undefined });
  } catch (err) {
    settleDetail(post, { error: messageOf(err) });
  }
}

function retryDetail(): void {
  const detail = state.detail;
  if (!detail || detail.loading) return;
  state.detail = { post: detail.post, loading: true };
  render();
  void loadDetail(detail.post);
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (state.page === 'post') closePost();
  else if (state.page === 'compose' && !state.compose.sending) closeCompose();
});

function openCompose(): void {
  const compose = emptyCompose();
  const filtered = state.view?.accounts.find((a) => a.id === state.filter);
  if (filtered?.connectionStatus === 'CONNECTED') compose.accountIds.add(filtered.id);
  state.compose = compose;
  state.page = 'compose';
  state.scrollToTop = true;
  render();
  document.getElementById('compose-back')?.focus({ preventScroll: true });
}

function closeCompose(): void {
  state.page = 'calendar';
  state.scrollToTop = true;
  render();
}

function composeMessage(accounts: AppAccount[], text: string, when: Date | null): string {
  const tz = timeZone();
  const list = accounts.map((a) => `${accountLabel(a)} (socialMediaId ${a.id})`).join('; ');
  return [
    'Help me create a new post in PostFast.',
    `Accounts: ${list}.`,
    text ? `Text: ${text}` : 'Text: not written yet. Ask me what the post is about, then draft it.',
    when
      ? `When: ${formatPostTime(when, tz, locale())} ${tz} (${when.toISOString()}).`
      : 'When: not chosen yet. Ask me, or keep it as a draft.',
    'Before creating anything, show me a preview of each post (account, text, media and time) and wait for my yes.',
  ].join('\n');
}

function clearComposeError(): void {
  if (!state.compose.error) return;
  state.compose.error = undefined;
  document.getElementById('compose-error')?.remove();
}

function composeError(message: string): void {
  state.compose.error = message;
  render();
  document.getElementById('compose-error')?.focus();
}

async function submitCompose(): Promise<void> {
  const compose = state.compose;
  const view = state.view;
  if (compose.sending || !view) return;
  const accounts = view.accounts.filter(
    (a) => compose.accountIds.has(a.id) && a.connectionStatus === 'CONNECTED',
  );
  if (!accounts.length) {
    composeError('Choose at least one connected account.');
    return;
  }
  let when: Date | null = null;
  if (compose.when) {
    when = wallTimeToDate(compose.when, timeZone());
    if (!when) {
      composeError('Enter a valid date and time.');
      return;
    }
    if (when.getTime() < Date.now() + 60_000) {
      composeError('Pick a time in the future.');
      return;
    }
  }
  const text = composeMessage(accounts, compose.text.trim(), when);
  compose.sending = true;
  compose.error = undefined;
  render();

  // A new conversation where the host supports it; on phones only the open one works.
  const message = host.platform === 'mobile' ? undefined : openai.message;
  const params = { role: 'user' as const, content: [{ type: 'text' as const, text }] };
  try {
    const result = message
      ? await message.send({ ...params, _meta: { 'openai/message': { target: 'new' } } })
      : await app.sendMessage(params);
    if (result?.isError) {
      compose.error = 'The conversation did not accept the message. Try again.';
      return;
    }
    record('new_post_started');
    state.compose = emptyCompose();
    state.page = 'calendar';
    state.scrollToTop = true;
    notify('success', message ? 'Started a new conversation for your post.' : 'Sent to the conversation.');
  } catch (err) {
    compose.error = `The message could not be sent: ${messageOf(err)}`;
  } finally {
    compose.sending = false;
    render();
  }
}

// ---------------------------------------------------------------------------
// Rendering

const root = document.getElementById('app') as HTMLElement;

function render(): void {
  const focusedId = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  const scrollY = window.scrollY;
  root.replaceChildren(...page());
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  if (state.restoreScroll !== undefined) {
    window.scrollTo(0, state.restoreScroll);
    state.restoreScroll = undefined;
  } else if (state.scrollToTop) {
    state.scrollToTop = false;
    window.scrollTo(0, 0);
  } else if (
    state.scrollToToday &&
    state.status === 'ready' &&
    state.page === 'calendar' &&
    host.displayMode !== 'inline'
  ) {
    // Only when the view scrolls itself; an inline view grows to full height.
    state.scrollToToday = false;
    const today = document.querySelector<HTMLElement>('[data-today]');
    const header = document.querySelector<HTMLElement>('.pf-topbar');
    if (today) {
      window.scrollTo(0, today.getBoundingClientRect().top + window.scrollY - (header?.offsetHeight ?? 0) - 12);
    }
  } else {
    window.scrollTo(0, scrollY);
  }
}

function page(): Node[] {
  const main =
    state.status === 'loading'
      ? loadingPage()
      : state.status === 'error'
        ? errorPage()
        : state.page === 'compose'
          ? composePage()
          : state.page === 'post' && state.detail
            ? postPage(state.detail)
            : calendarPage();
  return [h('div', { class: 'pf-shell' }, ...main), noticeView()].filter(Boolean) as Node[];
}

function button(
  label: Child,
  options: {
    variant?: 'primary' | 'outline' | 'ghost';
    icon?: GlyphName;
    onClick?: () => void;
    busy?: boolean;
    disabled?: boolean;
    small?: boolean;
    iconOnly?: string;
    /** Accessible name when CSS may hide the label (compact header). */
    ariaLabel?: string;
    id?: string;
    type?: 'button' | 'submit';
  } = {},
): HTMLButtonElement {
  const { variant = 'outline', icon, onClick, busy, disabled, small, iconOnly, ariaLabel, id, type = 'button' } = options;
  const classes = ['pf-btn', `pf-btn-${variant}`, small && 'pf-btn-sm', iconOnly && 'pf-btn-icon']
    .filter(Boolean)
    .join(' ');
  return h(
    'button',
    {
      type,
      class: classes,
      id,
      disabled: disabled || busy,
      'aria-busy': busy ? 'true' : undefined,
      'aria-label': iconOnly ?? ariaLabel,
      title: iconOnly,
      onclick: onClick ? () => onClick() : undefined,
    },
    busy ? glyph('spinner', 'icon pf-spin') : icon ? glyph(icon) : null,
    iconOnly || label === null ? null : h('span', { class: 'pf-btn-label' }, label),
  );
}

function topBar(): HTMLElement {
  const view = state.view;
  const title = view?.entrypoint === 'thread' ? 'PostFast Calendar' : 'Content Calendar';
  const subtitle = view ? `${view.workspace.name} · ${windowLabel()}` : 'PostFast';
  return h(
    'header',
    { class: 'pf-topbar' },
    h(
      'div',
      { class: 'pf-brand' },
      logoMark(),
      h('div', { class: 'pf-brand-text' }, h('h1', {}, title), h('p', { class: 'pf-brand-sub' }, subtitle)),
    ),
    view && view.accounts.length && state.status === 'ready' ? accountFilter(view) : null,
    view
      ? h(
          'div',
          { class: 'pf-topbar-actions' },
          canExpand()
            ? button(null, { variant: 'ghost', icon: 'expand', iconOnly: 'Expand', onClick: () => void expand(), id: 'expand' })
            : null,
          button(null, {
            variant: 'ghost',
            icon: 'refresh',
            iconOnly: 'Refresh',
            busy: state.refreshing,
            onClick: () => void reload('refresh'),
            id: 'refresh',
          }),
          view.accounts.length
            ? button('New post', { variant: 'primary', icon: 'plus', onClick: openCompose, id: 'new-post', ariaLabel: 'New post' })
            : null,
        )
      : null,
  );
}

/** The days the calendar covers, e.g. "28 Sept – 14 Oct". */
function windowLabel(): string {
  const format = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', timeZone: timeZone() });
  const now = Date.now();
  return `${format.format(now - DAYS_BACK * 86_400_000)} – ${format.format(now + DAYS_AHEAD * 86_400_000)}`;
}

function emptyState(
  icon: GlyphName,
  title: string,
  text: string,
  ...actions: Child[]
): HTMLElement {
  return h(
    'div',
    { class: 'pf-empty' },
    h('div', { class: 'pf-empty-icon' }, glyph(icon)),
    h('p', { class: 'pf-empty-title' }, title),
    h('p', { class: 'pf-empty-text' }, text),
    actions.length ? h('div', { class: 'pf-empty-actions' }, ...actions) : null,
  );
}

function loadingPage(): Child[] {
  const card = () =>
    h(
      'div',
      { class: 'pf-card', 'aria-hidden': 'true' },
      h(
        'div',
        { class: 'pf-card-head' },
        h('div', { class: 'pf-skel pf-skel-avatar' }),
        h('div', { class: 'pf-meta' }, h('div', { class: 'pf-skel pf-skel-line' }), h('div', { class: 'pf-skel pf-skel-line short' })),
      ),
      h('div', { class: 'pf-skel pf-skel-block' }),
    );
  const day = () =>
    h(
      'section',
      { class: 'pf-day' },
      h('div', { class: 'pf-skel pf-skel-title' }),
      h('div', { class: 'pf-grid' }, card(), card(), card()),
    );
  return [
    topBar(),
    h('p', { class: 'pf-sr-only', role: 'status' }, 'Loading your calendar…'),
    state.slow
      ? h(
          'div',
          { class: 'pf-slow' },
          'Still loading your calendar… ',
          button('Try again', { small: true, onClick: () => void reload('retry'), busy: state.refreshing }),
        )
      : null,
    day(),
    day(),
  ];
}

function errorPage(): Child[] {
  return [
    topBar(),
    emptyState(
      'alert',
      "Couldn't load the calendar",
      state.error || 'Something went wrong.',
      button('Try again', {
        variant: 'primary',
        icon: 'refresh',
        busy: state.refreshing,
        onClick: () => void reload('retry'),
      }),
    ),
  ];
}

function accountOf(post: AppPost): AppAccount | undefined {
  return state.view?.accounts.find((a) => a.id === post.socialMediaId);
}

/** "@kohifit" for a username; a display name is shown as it is. */
function handleText(handle: string): string {
  return /^[\w.]+$/.test(handle) ? `@${handle}` : handle;
}

function accountLabel(account: AppAccount): string {
  return account.handle
    ? `${platformName(account.platform)} ${handleText(account.handle)}`
    : platformName(account.platform);
}

function avatar(account: AppAccount | undefined, platform: string): HTMLElement {
  const wrap = h('div', { class: 'pf-avatar' });
  const url = safeUrl(account?.avatarUrl);
  const fallback = () => h('div', { class: 'pf-avatar-fallback' }, platformGlyph(platform));
  if (url) {
    const img = h('img', {
      class: 'pf-avatar-img',
      src: url,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
      referrerpolicy: 'no-referrer',
    });
    img.addEventListener('error', () => {
      img.replaceWith(fallback());
      refreshIfStale();
    });
    wrap.append(img, h('span', { class: 'pf-avatar-badge' }, platformGlyph(platform)));
  } else {
    wrap.append(fallback());
  }
  return wrap;
}

type ToneName = 'slate' | 'blue' | 'indigo' | 'green' | 'amber' | 'orange' | 'red';

type PostState = Pick<AppPost, 'status' | 'approvalStatus' | 'lastError'>;

function statusOf(post: PostState): { label: string; tone: ToneName; live?: boolean } {
  switch (post.status) {
    case 'FAILED':
      return { label: 'Failed', tone: 'red' };
    case 'PUBLISHED':
      return { label: 'Published', tone: 'green' };
    case 'PROCESSING':
      return { label: 'Publishing', tone: 'indigo', live: true };
    case 'DRAFT':
      return { label: 'Draft', tone: 'slate' };
  }
  switch (post.approvalStatus) {
    case 'PENDING_APPROVAL':
      return { label: 'Pending approval', tone: 'amber' };
    case 'IN_PROGRESS':
      return { label: 'In progress', tone: 'blue' };
    case 'NEEDS_WORK':
      return { label: 'Needs work', tone: 'orange' };
    case 'REJECTED':
      return { label: 'Rejected', tone: 'red' };
  }
  return { label: 'Scheduled', tone: 'blue' };
}

const MISSED: Record<string, string> = {
  MISSED_DISCONNECTED: 'Missed: the account was disconnected.',
  MISSED_NOT_PUBLISHED: 'Missed: not published in time.',
};

function problemOf(post: PostState, account: AppAccount | undefined): string | null {
  if (post.status === 'FAILED') {
    const error = post.lastError;
    return (error?.code && MISSED[error.code]) || error?.message?.trim() || 'Failed to publish.';
  }
  if ((post.status === 'SCHEDULED' || post.status === 'PROCESSING') && account?.connectionStatus === 'DISABLED') {
    return "Won't publish: the account is disconnected.";
  }
  return null;
}

function mediaThumb(post: AppPost): HTMLElement | null {
  const media = post.thumbnail;
  if (!media && !post.mediaCount) return null;
  const box = h('span', { class: 'pf-thumb', 'aria-hidden': 'true' });
  const placeholder = () => glyph(media?.type === 'VIDEO' ? 'play' : 'image', 'pf-thumb-placeholder');
  const onError = (el: HTMLElement) => () => {
    el.replaceWith(placeholder());
    refreshIfStale();
  };
  const still = safeUrl(media?.type === 'VIDEO' ? media.coverImageUrl : media?.mediaUrl);
  const video = media?.type === 'VIDEO' ? safeUrl(media.mediaUrl) : null;
  if (still) {
    const img = h('img', { src: still, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', onError(img));
    box.append(img);
  } else if (video) {
    // No cover image: show the video's first frames, never playing.
    const el = h('video', { src: `${video}#t=0.5`, preload: 'metadata', playsinline: true, tabindex: '-1' });
    el.muted = true;
    el.addEventListener('error', onError(el));
    box.append(el);
  } else {
    box.append(placeholder());
  }
  if (media?.type === 'VIDEO') box.append(h('span', { class: 'pf-thumb-play' }, glyph('play', 'icon')));
  if (post.mediaCount > 1) {
    box.append(h('span', { class: 'pf-thumb-count' }, glyph('layers', 'icon'), String(post.mediaCount)));
  }
  return box;
}

function postCard(post: AppPost): HTMLElement {
  const account = accountOf(post);
  const platform = account?.platform ?? '';
  const status = statusOf(post);
  const when = parseDate(post.scheduledAt);
  const time = when ? formatPostTime(when, timeZone(), locale()) : 'No date yet';
  const problem = problemOf(post, account);
  const handle = account?.handle ? handleText(account.handle) : account ? platformName(platform) : 'Unknown account';
  const canReview =
    post.approvalStatus === 'PENDING_APPROVAL' && (post.status === 'SCHEDULED' || post.status === 'DRAFT');
  const canReconnect =
    !!account && account.connectionStatus === 'DISABLED' && post.status !== 'PUBLISHED' && post.status !== 'DRAFT';
  const caption = post.content.trim();

  return h(
    'article',
    { class: 'pf-card', 'aria-label': `${account ? accountLabel(account) : handle}, ${time}, ${status.label}` },
    h(
      'div',
      { class: 'pf-card-head' },
      avatar(account, platform),
      h(
        'div',
        { class: 'pf-meta' },
        h(
          'div',
          { class: 'pf-meta-top' },
          h('div', { class: 'pf-account', title: handle }, handle),
          h('span', { class: `pf-chip tone-${status.tone}${status.live ? ' is-live' : ''}` }, status.label),
        ),
        h('div', { class: 'pf-time' }, time),
      ),
    ),
    h(
      'button',
      { type: 'button', class: 'pf-body', id: `view-${post.id}`, onclick: () => openPost(post) },
      h(
        'span',
        { class: 'pf-body-text' },
        h('span', { class: caption ? 'pf-caption' : 'pf-caption is-empty' }, caption || 'No text'),
        h('span', { class: 'pf-more-link' }, 'Show full post', glyph('chevronRight', 'icon')),
      ),
      mediaThumb(post),
    ),
    problem ? h('div', { class: 'pf-alert', role: 'note' }, glyph('alert'), h('span', {}, problem)) : null,
    h(
      'div',
      { class: 'pf-actions' },
      // Stable ids let render() give focus back to the same button.
      button('Open in PostFast', {
        small: true,
        icon: 'external',
        id: `open-${post.id}`,
        onClick: () => openInPostFast(post.openUrl),
      }),
      canReview
        ? button('Review in chat', {
            small: true,
            icon: 'message',
            id: `review-${post.id}`,
            busy: state.pending.has(`review:${post.id}`),
            onClick: () => void reviewInChat(post),
          })
        : null,
      canReconnect && account
        ? button('Reconnect', {
            small: true,
            icon: 'plug',
            id: `reconnect-${post.id}`,
            busy: state.pending.has(`reconnect:${account.id}`),
            onClick: () => void reconnect(account),
          })
        : null,
    ),
  );
}

/** "Scheduled for Thu 1 Oct, 09:00", "Published …", or "No date yet". */
function whenLabel(post: Pick<AppPost, 'status' | 'scheduledAt' | 'publishedAt'>): string {
  const tz = timeZone();
  const published = parseDate(post.publishedAt);
  const scheduled = parseDate(post.scheduledAt);
  if (post.status === 'PUBLISHED' && (published ?? scheduled)) {
    return `Published ${formatPostTime((published ?? scheduled) as Date, tz, locale())}`;
  }
  if (scheduled) {
    return `${post.status === 'FAILED' ? 'Was due' : 'Scheduled for'} ${formatPostTime(scheduled, tz, locale())}`;
  }
  return 'No date yet';
}

/** Every image and video of a post, in its carousel order. */
function mediaGallery(items: AppMediaItem[]): HTMLElement {
  const single = items.length === 1;
  const grid = h('div', { class: single ? 'pf-gallery is-single' : 'pf-gallery' });
  items.forEach((item, i) => {
    const figure = h('figure', { class: 'pf-media' });
    const label = `${item.type === 'VIDEO' ? 'Video' : 'Image'} ${i + 1} of ${items.length}`;
    const cover = item.type === 'VIDEO' ? safeUrl(item.coverImageUrl) : null;
    // A video that can't play still shows its cover image when it has one.
    const missing = () =>
      cover
        ? h(
            'span',
            { class: 'pf-media-cover' },
            h('img', { src: cover, alt: label, referrerpolicy: 'no-referrer' }),
            h('span', { class: 'pf-media-caption' }, "The video can't be played here."),
          )
        : h(
            'span',
            { class: 'pf-media-missing' },
            glyph(item.type === 'VIDEO' ? 'play' : 'image', 'pf-thumb-placeholder'),
            "This file can't be shown here.",
          );
    const url = safeUrl(item.mediaUrl);
    if (!url) {
      figure.append(missing());
    } else if (item.type === 'VIDEO') {
      const video = h('video', {
        src: url,
        controls: true,
        playsinline: true,
        preload: 'metadata',
        poster: cover ?? undefined,
        'aria-label': label,
      });
      video.addEventListener('error', () => video.replaceWith(missing()));
      figure.append(video);
    } else {
      const img = h('img', { src: url, alt: label, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => img.replaceWith(missing()));
      figure.append(img);
    }
    if (!single) figure.append(h('span', { class: 'pf-media-order', 'aria-hidden': 'true' }, String(i + 1)));
    grid.append(figure);
  });
  return grid;
}

function postPage(detail: DetailState): Child[] {
  const { post, full } = detail;
  const account = accountOf(post);
  const platform = account?.platform ?? '';
  const status = statusOf(post);
  const problem = problemOf(post, account);
  const handle = account?.handle ? handleText(account.handle) : account ? platformName(platform) : 'Unknown account';
  const text = (full?.content ?? post.content).trim();
  const items = full ? full.mediaItems : post.thumbnail ? [post.thumbnail] : [];
  const canReview =
    post.approvalStatus === 'PENDING_APPROVAL' && (post.status === 'SCHEDULED' || post.status === 'DRAFT');
  const canReconnect =
    !!account && account.connectionStatus === 'DISABLED' && post.status !== 'PUBLISHED' && post.status !== 'DRAFT';
  const section = (label: string, ...children: Child[]) =>
    h('div', { class: 'pf-detail-section' }, h('p', { class: 'pf-section-label' }, label), ...children);

  return [
    h(
      'header',
      { class: 'pf-topbar' },
      h(
        'div',
        { class: 'pf-brand' },
        button('Calendar', { variant: 'ghost', icon: 'chevronLeft', onClick: closePost, id: 'post-back' }),
        h('h1', {}, 'Post'),
      ),
    ),
    h(
      'article',
      { class: 'pf-detail', 'aria-busy': detail.loading ? 'true' : undefined },
      h(
        'div',
        { class: 'pf-card-head' },
        avatar(account, platform),
        h(
          'div',
          { class: 'pf-meta' },
          h(
            'div',
            { class: 'pf-meta-top' },
            h('div', { class: 'pf-account', title: handle }, handle),
            h('span', { class: `pf-chip tone-${status.tone}${status.live ? ' is-live' : ''}` }, status.label),
          ),
          h('div', { class: 'pf-time' }, whenLabel(post), platform ? ` · ${platformName(platform)}` : ''),
        ),
      ),
      problem ? h('div', { class: 'pf-alert', role: 'note' }, glyph('alert'), h('span', {}, problem)) : null,
      detail.error
        ? h(
            'div',
            { class: 'pf-alert pf-alert-action', role: 'alert' },
            glyph('alert'),
            h('span', {}, `Couldn't load the full post. ${detail.error}`),
            button('Try again', { small: true, onClick: retryDetail, id: 'detail-retry' }),
          )
        : null,
      section(
        'Text',
        h('div', { class: text ? 'pf-fulltext' : 'pf-fulltext is-empty' }, text || 'No text'),
        detail.loading
          ? h('p', { class: 'pf-loading-line', role: 'status' }, glyph('spinner', 'icon pf-spin'), 'Loading the full post…')
          : null,
        full?.contentTruncated
          ? h('p', { class: 'pf-note' }, 'This post is longer than shown here. Open it in PostFast to read all of it.')
          : null,
      ),
      full?.firstComment?.trim() ? section('First comment', h('div', { class: 'pf-first-comment' }, full.firstComment.trim())) : null,
      items.length
        ? section(
            post.mediaCount > 1 ? `Media · ${post.mediaCount}` : 'Media',
            mediaGallery(items),
            detail.partial && post.mediaCount > 1
              ? h('p', { class: 'pf-note' }, 'Showing the first item only. Open in PostFast to see all of them.')
              : null,
          )
        : null,
      h(
        'div',
        { class: 'pf-actions' },
        button('Open in PostFast', {
          small: true,
          icon: 'external',
          id: 'detail-open',
          onClick: () => openInPostFast(full?.openUrl ?? post.openUrl),
        }),
        canReview
          ? button('Review in chat', {
              small: true,
              icon: 'message',
              id: 'detail-review',
              busy: state.pending.has(`review:${post.id}`),
              onClick: () => void reviewInChat(post),
            })
          : null,
        canReconnect && account
          ? button('Reconnect', {
              small: true,
              icon: 'plug',
              id: 'detail-reconnect',
              busy: state.pending.has(`reconnect:${account.id}`),
              onClick: () => void reconnect(account),
            })
          : null,
      ),
    ),
  ];
}

function daySection(
  title: string,
  subtitle: string | undefined,
  posts: AppPost[],
  attrs: Record<string, string> = {},
): HTMLElement {
  const count = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`;
  return h(
    'section',
    { class: 'pf-day', ...attrs },
    h(
      'div',
      { class: 'pf-day-head' },
      h('h2', { class: 'pf-day-title' }, title),
      h('span', { class: 'pf-sep', 'aria-hidden': 'true' }),
      h('span', { class: 'pf-day-sub' }, subtitle ? `${subtitle} · ${count}` : count),
    ),
    h('div', { class: 'pf-grid' }, ...posts.map(postCard)),
  );
}

function accountFilter(view: AppCalendarView): HTMLElement {
  const select = h(
    'select',
    {
      id: 'account-filter',
      'aria-label': 'Filter by account',
      onchange: (event: Event) => {
        state.filter = (event.target as HTMLSelectElement).value;
        render();
      },
    },
    h('option', { value: 'all' }, `All accounts (${view.accounts.length})`),
    ...view.accounts.map((a) =>
      h(
        'option',
        { value: a.id },
        `${accountLabel(a)}${a.connectionStatus === 'DISABLED' ? ' (disconnected)' : ''}`,
      ),
    ),
  );
  select.value = state.filter;
  return h('div', { class: 'pf-select' }, select, glyph('chevronDown'));
}

function summaryBar(visible: AppPost[]): HTMLElement {
  const failed = visible.filter((p) => p.status === 'FAILED').length;
  const pending = visible.filter(
    (p) => p.approvalStatus === 'PENDING_APPROVAL' && (p.status === 'SCHEDULED' || p.status === 'DRAFT'),
  ).length;
  const stats: Child[] = [
    h('span', { class: 'pf-stat' }, `${visible.length} ${visible.length === 1 ? 'post' : 'posts'}`),
  ];
  if (pending) stats.push(h('span', { class: 'pf-stat tone-amber' }, `${pending} pending approval`));
  if (failed) stats.push(h('span', { class: 'pf-stat tone-red' }, `${failed} failed`));
  return h('div', { class: 'pf-toolbar' }, h('div', { class: 'pf-stats' }, ...stats));
}

function calendarPage(): Child[] {
  const view = state.view as AppCalendarView;
  if (!view.accounts.length) {
    return [
      topBar(),
      emptyState(
        'userPlus',
        'Connect an account',
        'Connect a social account in PostFast to plan and schedule posts here.',
        button('Connect an account', { variant: 'primary', icon: 'external', onClick: connectAccount }),
      ),
    ];
  }

  const tz = timeZone();
  const today = dayKey(new Date(), tz);
  const matches = (p: AppPost) => state.filter === 'all' || p.socialMediaId === state.filter;
  const days = new Map<string, AppPost[]>();
  const undated: AppPost[] = [];
  for (const post of view.posts) {
    if (!matches(post)) continue;
    const when = parseDate(post.scheduledAt);
    if (!when) {
      undated.push(post);
      continue;
    }
    const key = dayKey(when, tz);
    const diff = daysBetween(today, key);
    if (diff < -DAYS_BACK || diff > DAYS_AHEAD) continue;
    const list = days.get(key) ?? [];
    list.push(post);
    days.set(key, list);
  }
  undated.push(...view.drafts.filter(matches));
  const dated = [...days.values()].flat();
  const visible = [...dated, ...undated];

  const content: Child[] = [topBar(), summaryBar(visible)];
  if (!view.posts.length && !view.drafts.length) {
    content.push(
      emptyState(
        'calendar',
        'Nothing planned yet',
        `No posts from the last ${DAYS_BACK} days through the next ${DAYS_AHEAD}, and no drafts.`,
        button('New post', { variant: 'primary', icon: 'plus', onClick: openCompose }),
      ),
    );
    return content;
  }
  if (!visible.length) {
    content.push(
      emptyState(
        'calendar',
        'No posts for this account',
        'Nothing is planned for it in this period.',
        button('Show all accounts', {
          onClick: () => {
            state.filter = 'all';
            render();
          },
        }),
      ),
    );
    return content;
  }

  let markedToday = false;
  for (const [key, posts] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const { title, subtitle } = dayTitle(key, today, locale());
    const attrs: Record<string, string> = {};
    // The first section from today on is where the calendar opens.
    if (!markedToday && daysBetween(today, key) >= 0) {
      attrs['data-today'] = '';
      markedToday = true;
    }
    content.push(daySection(title, subtitle, posts, attrs));
  }
  if (undated.length) content.push(daySection('Drafts', 'No date yet', undated));
  if (view.hasMore || view.draftsHasMore) {
    content.push(
      h(
        'div',
        { class: 'pf-more' },
        h('span', {}, 'There are more posts than this calendar shows.'),
        button('See all in PostFast', { small: true, icon: 'external', onClick: () => void openExternal(view.links.posts) }),
      ),
    );
  }
  return content;
}

function accountTile(account: AppAccount): HTMLElement {
  const connected = account.connectionStatus === 'CONNECTED';
  const selected = state.compose.accountIds.has(account.id);
  const tile = h(
    'button',
    {
      type: 'button',
      class: 'pf-tile',
      id: `tile-${account.id}`,
      'aria-pressed': selected ? 'true' : 'false',
      disabled: !connected,
    },
    avatar(account, account.platform),
    h(
      'span',
      { class: 'pf-tile-text' },
      h('span', { class: 'pf-tile-name' }, account.handle ? handleText(account.handle) : platformName(account.platform)),
      h('span', { class: 'pf-tile-sub' }, connected ? platformName(account.platform) : 'Disconnected: reconnect first'),
    ),
    h('span', { class: 'pf-tile-check', 'aria-hidden': 'true' }, glyph('check')),
  );
  // Toggled in place, so typing in the form is never re-rendered away.
  tile.addEventListener('click', () => {
    const ids = state.compose.accountIds;
    if (ids.has(account.id)) ids.delete(account.id);
    else ids.add(account.id);
    tile.setAttribute('aria-pressed', ids.has(account.id) ? 'true' : 'false');
    clearComposeError();
  });
  return tile;
}

function composePage(): Child[] {
  const view = state.view as AppCalendarView;
  const compose = state.compose;
  const tz = timeZone();
  const textarea = h('textarea', {
    id: 'compose-text',
    class: 'pf-textarea',
    rows: 6,
    maxlength: MAX_TEXT,
    placeholder: 'Write the post, or describe what it should say and it will be drafted in the conversation.',
    oninput: (event: Event) => {
      compose.text = (event.target as HTMLTextAreaElement).value;
      clearComposeError();
    },
  });
  textarea.value = compose.text;
  const when = h('input', {
    id: 'compose-when',
    class: 'pf-input',
    type: 'datetime-local',
    min: dateToWallTime(new Date(Date.now() + 5 * 60_000), tz),
    oninput: (event: Event) => {
      compose.when = (event.target as HTMLInputElement).value;
      clearComposeError();
    },
  });
  when.value = compose.when;
  const accounts = [...view.accounts].sort(
    (a, b) => Number(b.connectionStatus === 'CONNECTED') - Number(a.connectionStatus === 'CONNECTED'),
  );

  const form = h(
    'form',
    {
      class: 'pf-compose',
      novalidate: true,
      onsubmit: (event: Event) => {
        event.preventDefault();
        void submitCompose();
      },
    },
    h(
      'fieldset',
      { class: 'pf-field' },
      h('legend', { class: 'pf-label' }, 'Accounts'),
      h('div', { class: 'pf-account-grid' }, ...accounts.map(accountTile)),
    ),
    h(
      'div',
      { class: 'pf-field' },
      h('label', { class: 'pf-label', for: 'compose-text' }, 'What should it say?'),
      textarea,
    ),
    h(
      'div',
      { class: 'pf-field' },
      h('label', { class: 'pf-label', for: 'compose-when' }, 'When ', h('span', { class: 'pf-optional' }, '(optional)')),
      when,
      h('p', { class: 'pf-hint' }, `Times are in ${tz}. Leave it empty to decide in the conversation.`),
    ),
    compose.error
      ? h('div', { class: 'pf-alert', id: 'compose-error', role: 'alert', tabindex: '-1' }, glyph('alert'), h('span', {}, compose.error))
      : null,
    h(
      'div',
      { class: 'pf-compose-actions' },
      button('Cancel', { onClick: closeCompose, disabled: compose.sending }),
      button('Continue in chat', { variant: 'primary', icon: 'send', type: 'submit', busy: compose.sending, id: 'compose-submit' }),
    ),
    h('p', { class: 'pf-hint pf-center' }, 'Nothing is created until you confirm the preview in the conversation.'),
  );

  return [
    h(
      'header',
      { class: 'pf-topbar' },
      h(
        'div',
        { class: 'pf-brand' },
        button('Calendar', { variant: 'ghost', icon: 'chevronLeft', onClick: closeCompose, id: 'compose-back' }),
        h('h1', {}, 'New post'),
      ),
    ),
    form,
  ];
}

function noticeView(): HTMLElement | null {
  const notice = state.notice;
  if (!notice) return null;
  const icon: GlyphName = notice.tone === 'success' ? 'checkCircle' : notice.tone === 'error' ? 'alert' : 'message';
  return h(
    'div',
    { class: `pf-notice is-${notice.tone}`, role: notice.tone === 'error' ? 'alert' : 'status' },
    glyph(icon),
    h('span', { class: 'pf-notice-text' }, notice.text),
    button(null, {
      variant: 'ghost',
      icon: 'x',
      iconOnly: 'Dismiss',
      small: true,
      onClick: () => {
        clearTimeout(noticeTimer);
        state.notice = undefined;
        render();
      },
    }),
  );
}

// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  render();
  try {
    await app.connect();
  } catch (err) {
    fail(`Couldn't connect to the chat: ${messageOf(err)}`);
    return;
  }
  applyHost();
  render();
  if (state.status === 'loading') {
    slowTimer = setTimeout(() => {
      if (state.status === 'loading') {
        state.slow = true;
        render();
      }
    }, SLOW_LOAD_MS);
  }
}

void start();
