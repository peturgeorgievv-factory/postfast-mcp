// The calendar app (BuildToolsOptions.app), exercised against the built dist
// through the real SDK: registerCatalogTools on an McpServer, listed and
// called by a Client over an in-memory transport. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpUiResourceMetaSchema, McpUiToolMetaSchema } from '@modelcontextprotocol/ext-apps';
import {
  OpenAIUiResourceMetadataSchema,
  OpenAIUiToolMetadataSchema,
} from '@openai/mcp-extensions/server';
import {
  ALL_TOOLS,
  APP_RESOURCE_MIME_TYPE,
  APP_RESOURCE_URI,
  buildTools,
  registerCatalogTools,
} from '../dist/core/index.js';

const APP = {
  mediaOrigin: 'https://media.example.com',
  domain: 'https://mcp.example.com',
  webAppUrl: 'https://app.example.com',
};
const APP_TOOLS = ['open_postfast', 'postfast_tab', 'get_calendar_post', 'record_app_action'];
const WS = '33333333-3333-4333-8333-333333333333';
const SECRET = 'app-test-confirm-gate-secret-32ch';

const signed = (key) =>
  `${APP.mediaOrigin}/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${'k'.repeat(20)}%2F20261001%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261001T090000Z&X-Amz-Expires=900&X-Amz-SignedHeaders=host&X-Amz-Signature=${'f'.repeat(64)}&x-id=GetObject`;

const account = (i, extra = {}) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
  platform: 'INSTAGRAM',
  platformUsername: `brand${i}`,
  displayName: `Brand ${i}`,
  connectionStatus: 'CONNECTED',
  disabledReason: null,
  avatarUrl: signed(`avatars/${i}.jpg`),
  ...extra,
});

/** A media item in the API's usual shape, with signed display URLs. */
const mediaItem = (key, sortOrder = 0, extra = {}) => ({
  type: key.startsWith('video/') ? 'VIDEO' : 'IMAGE',
  key,
  sortOrder,
  coverImageKey: null,
  coverTimestamp: null,
  mediaUrl: signed(key),
  coverImageUrl: null,
  ...extra,
});

const post = (i, accountId, extra = {}) => ({
  id: `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, '0')}`,
  socialMediaId: accountId,
  status: 'SCHEDULED',
  approvalStatus: 'APPROVED',
  scheduledAt: new Date(Date.now() + (i + 1) * 3_600_000).toISOString(),
  publishedAt: null,
  content: `Post ${i}`,
  lastError: null,
  mediaCount: 1,
  thumbnail: mediaItem(`image/${i}.jpg`),
  ...extra,
});

function calendar() {
  const a1 = account(1);
  const a2 = account(2, { platform: 'X', platformUsername: null, displayName: 'Acme News' });
  const a3 = account(3, {
    platform: 'FACEBOOK',
    platformUsername: null,
    displayName: null,
    connectionStatus: 'DISABLED',
    disabledReason: 'TOKEN_REVOKED',
    avatarUrl: null,
  });
  return {
    workspace: { id: WS, name: 'Acme' },
    accounts: [a1, a2, a3],
    posts: [
      post(1, a1.id, { content: 'x'.repeat(400) }),
      post(2, a2.id, { status: 'FAILED', lastError: { message: 'Token expired', code: 'MISSED_DISCONNECTED' } }),
      post(3, a1.id, { status: 'PUBLISHED', publishedAt: new Date().toISOString() }),
      post(4, a3.id, {
        approvalStatus: 'PENDING_APPROVAL',
        thumbnail: mediaItem('video/4.mp4', 0, { coverImageKey: 'image/4-cover.jpg', coverImageUrl: signed('image/4-cover.jpg') }),
      }),
    ],
    drafts: [post(5, a1.id, { status: 'DRAFT', scheduledAt: null, thumbnail: null, mediaCount: 0 })],
    hasMore: false,
    draftsHasMore: false,
  };
}

/** One post in full, as the backend returns it for get_calendar_post. */
function postDetail(extra = {}) {
  const items = [
    mediaItem('image/10.jpg', 0),
    mediaItem('video/11.mp4', 1, { coverImageKey: 'image/11-cover.jpg', coverImageUrl: signed('image/11-cover.jpg') }),
    mediaItem('image/12.jpg', 2),
  ];
  const { thumbnail: _thumb, ...base } = post(10, account(1).id, { content: 'Long caption. '.repeat(120), mediaCount: 3 });
  return { ...base, workspaceId: WS, firstComment: 'Link in bio!', mediaItems: items, ...extra };
}

const PERSONAL = '00000000-0000-4000-8000-0000000000aa';
const CLIENT = '00000000-0000-4000-8000-0000000000bb';
/** list_workspaces' answer: the connection's workspaces, in the backend's order. */
const WORKSPACES = {
  data: [
    { id: CLIENT, name: 'zeta Client', isPersonal: false },
    { id: WS, name: 'Acme', isPersonal: false },
    { id: PERSONAL, name: 'Personal', isPersonal: true },
  ],
};

/** A port answering the app methods from `payload` and recording every call. */
function appPort(payload = calendar(), { fail, detail = postDetail(), workspaces = WORKSPACES } = {}) {
  const calls = [];
  const port = new Proxy(
    {},
    {
      get: (_t, method) => {
        if (method === 'then') return undefined;
        return async (...args) => {
          calls.push({ method, args });
          if (fail) throw new Error(fail);
          if (method === 'getAppCalendar') return structuredClone(payload);
          if (method === 'getAppPost') return structuredClone(detail);
          if (method === 'listWorkspaces') {
            if (typeof workspaces === 'function') return workspaces();
            return structuredClone(workspaces);
          }
          return { ok: true };
        };
      },
    },
  );
  return { port, calls };
}

async function connect(options) {
  const server = new McpServer(
    { name: 'app-test', version: '0.0.0' },
    { capabilities: { tools: {}, logging: {} } },
  );
  registerCatalogTools(server, options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'app-test', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

/** The host's options: every hosted session is gated, with the app on. */
const remote = (port, extra = {}) => ({
  binding: 'remote',
  withWorkspaceField: true,
  port,
  confirmGate: { secret: SECRET },
  app: APP,
  ...extra,
});

const names = (tools) => tools.map((t) => t.name);
const viewOf = (result) => result._meta?.['postfast/calendar'];
/** Every string anywhere in a value. */
const strings = (value) =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.values(value).flatMap(strings)
      : [];

test('without the app option no binding lists the app tools', () => {
  assert.deepEqual(names(ALL_TOOLS).slice(-APP_TOOLS.length), APP_TOOLS, 'appended at the end of the catalog');
  const surfaces = [
    buildTools({ binding: 'stdio' }),
    buildTools({ binding: 'remote', withWorkspaceField: true }),
    buildTools({ binding: 'remote', withWorkspaceField: true, confirmGate: { secret: SECRET } }),
    buildTools({ binding: 'stdio', app: APP }),
  ];
  assert.deepEqual(
    surfaces.map((tools) => tools.length),
    [25, 25, 27, 25],
  );
  for (const tools of surfaces) {
    assert.ok(!names(tools).some((name) => APP_TOOLS.includes(name)));
  }
});

test('the app only appends: every existing tool resolves exactly as without it', () => {
  const shape = (tools) =>
    tools.map((t) => [
      t.name,
      t.title,
      t.description,
      Object.keys(t.inputSchema),
      t.annotations,
      t._meta,
      t.icons,
      t.toResult,
    ]);
  for (const extra of [{}, { confirmGate: { secret: SECRET } }]) {
    const off = buildTools({ binding: 'remote', withWorkspaceField: true, ...extra });
    const on = buildTools({ binding: 'remote', withWorkspaceField: true, app: APP, ...extra });
    assert.deepEqual(names(on), [...names(off), ...APP_TOOLS]);
    assert.deepEqual(shape(on.slice(0, off.length)), shape(off));
  }
});

test('app options must be bare https origins (http only on loopback)', () => {
  const build = (app) => buildTools({ binding: 'remote', app });
  for (const [key, value] of [
    ['mediaOrigin', 'http://media.example.com'],
    ['mediaOrigin', 'https://media.example.com/bucket'],
    ['domain', 'https://mcp.example.com/'],
    ['webAppUrl', 'app.example.com'],
    ['webAppUrl', undefined],
  ]) {
    assert.throws(() => build({ ...APP, [key]: value }), new RegExp(`app\\.${key} must be an https origin`));
  }
  assert.doesNotThrow(() => build({ ...APP, mediaOrigin: 'http://localhost:3002', webAppUrl: 'http://127.0.0.1:5100' }));
});

test('tool and resource _meta match the ext-apps and mcp-extensions schemas', async () => {
  const client = await connect(remote(appPort().port));
  const { tools } = await client.listTools();
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  for (const [name, type] of [
    ['open_postfast', 'global'],
    ['postfast_tab', 'thread'],
  ]) {
    const meta = byName[name]._meta;
    assert.deepEqual(McpUiToolMetaSchema.parse(meta.ui), { resourceUri: APP_RESOURCE_URI, visibility: ['app'] });
    assert.equal(meta['ui/resourceUri'], APP_RESOURCE_URI);
    assert.deepEqual(OpenAIUiToolMetadataSchema.parse(meta['openai/ui']), { entrypoints: [{ type }] });
    assert.equal(meta['openai/iconStyle'], 'monochrome');
    assert.equal(byName[name].annotations.readOnlyHint, true);
  }
  assert.deepEqual(McpUiToolMetaSchema.parse(byName.record_app_action._meta.ui), { visibility: ['app'] });
  assert.equal(byName.record_app_action.annotations.readOnlyHint, false);
  assert.deepEqual(McpUiToolMetaSchema.parse(byName.get_calendar_post._meta.ui), { visibility: ['app'] });
  assert.equal(byName.get_calendar_post.annotations.readOnlyHint, true);

  const { resources } = await client.listResources();
  assert.equal(resources.length, 1);
  const [resource] = resources;
  assert.equal(resource.uri, APP_RESOURCE_URI);
  assert.equal(resource.mimeType, APP_RESOURCE_MIME_TYPE);
  const uiMeta = McpUiResourceMetaSchema.parse(resource._meta.ui);
  assert.deepEqual(uiMeta.csp, { resourceDomains: [APP.mediaOrigin], connectDomains: [] });
  assert.equal(uiMeta.domain, APP.domain);
  assert.deepEqual(OpenAIUiResourceMetadataSchema.parse(resource._meta['openai/ui']), {
    preferredDisplayMode: 'fullscreen',
  });

  // Negative controls: the schemas do reject wrong shapes.
  assert.equal(McpUiToolMetaSchema.safeParse({ visibility: ['everyone'] }).success, false);
  assert.equal(OpenAIUiToolMetadataSchema.safeParse({ entrypoints: [{ type: 'sidebar' }] }).success, false);
  await client.close();
});

test('tools/list carries the monochrome icon on the two entrypoints only', async () => {
  const client = await connect(remote(appPort().port));
  const { tools } = await client.listTools();
  const withIcons = tools.filter((t) => t.icons);
  assert.deepEqual(names(withIcons), ['open_postfast', 'postfast_tab']);
  const [icon] = withIcons[0].icons;
  assert.equal(icon.mimeType, 'image/svg+xml');
  const svg = Buffer.from(icon.src.replace('data:image/svg+xml;base64,', ''), 'base64').toString();
  assert.match(svg, /viewBox="0 0 20 20"/);
  assert.match(svg, /stroke="currentColor"/);
  assert.match(svg, /stroke-width="1\.33"/);
  assert.match(svg, /fill="none"/);
  await client.close();
});

test('resources/read serves the built single-file view', async () => {
  const client = await connect(remote(appPort().port));
  const { contents } = await client.readResource({ uri: APP_RESOURCE_URI });
  assert.equal(contents.length, 1);
  const [{ text, mimeType, _meta }] = contents;
  assert.equal(mimeType, APP_RESOURCE_MIME_TYPE);
  assert.deepEqual(_meta.ui.csp, { resourceDomains: [APP.mediaOrigin], connectDomains: [] });
  assert.match(text, /^<!doctype html>/i);
  assert.doesNotMatch(text, /<script[^>]+\bsrc=/i, 'no external scripts');
  assert.doesNotMatch(text, /<link[^>]+stylesheet/i, 'no external stylesheets');
  assert.equal(text.match(/<script/gi).length, 1);
  await client.close();
});

test('open_postfast: the view reaches only _meta; the model sees counts', async () => {
  const { port, calls } = appPort();
  const client = await connect(remote(port));
  const before = Date.now();
  const result = await client.callTool({ name: 'open_postfast', arguments: {} });
  assert.equal(result.isError, undefined);

  // The calendar and, alongside it, the switcher's workspace list.
  assert.deepEqual(calls.map((c) => c.method).sort(), ['getAppCalendar', 'listWorkspaces']);
  const { args } = calls.find((c) => c.method === 'getAppCalendar');
  const [request, workspaceId] = args;
  assert.equal(workspaceId, undefined);
  assert.deepEqual(
    { ...request, from: undefined, to: undefined },
    { limit: 100, draftsLimit: 20, entrypoint: 'global', refresh: false, from: undefined, to: undefined },
  );
  const day = 86_400_000;
  assert.ok(Math.abs(Date.parse(request.from) - (before - 3 * day)) < 5_000);
  assert.ok(Math.abs(Date.parse(request.to) - (before + 15 * day)) < 5_000);

  // Nothing the model can read carries a URL.
  for (const s of [...strings(result.content), ...strings(result.structuredContent)]) {
    assert.doesNotMatch(s, /https?:\/\//);
  }
  assert.deepEqual(
    { ...result.structuredContent, window: undefined },
    { window: undefined, posts: 4, drafts: 1, failed: 1, pendingApproval: 1, hasMore: false },
  );

  const view = viewOf(result);
  assert.equal(view.version, 1);
  assert.equal(view.entrypoint, 'global');
  assert.deepEqual(view.workspace, { id: WS, name: 'Acme' });
  // Personal first, then by name, case-insensitively.
  assert.deepEqual(view.workspaces, [
    { id: PERSONAL, name: 'Personal' },
    { id: WS, name: 'Acme' },
    { id: CLIENT, name: 'zeta Client' },
  ]);
  // Other workspaces' names reach the view only, never the model.
  for (const s of [...strings(result.content), ...strings(result.structuredContent)]) {
    assert.doesNotMatch(s, /zeta Client|Personal/);
  }
  assert.deepEqual(
    view.accounts.map((a) => a.handle),
    ['brand1', 'Acme News', null],
  );
  assert.deepEqual(view.posts[0].thumbnail, calendar().posts[0].thumbnail);
  assert.equal(view.posts[3].thumbnail.coverImageUrl, calendar().posts[3].thumbnail.coverImageUrl);

  const [long] = view.posts;
  assert.equal(long.contentTruncated, true);
  assert.equal(long.content.length, 280);
  assert.ok(long.content.endsWith('…'));
  assert.equal(view.posts[1].contentTruncated, false);

  const open = (p) => Object.fromEntries(new URL(p.openUrl).searchParams);
  assert.ok(view.posts[0].openUrl.startsWith(`${APP.webAppUrl}/dashboard/posts?`));
  assert.deepEqual(open(view.posts[0]), { tab: 'scheduled', editPostId: view.posts[0].id, workspaceId: WS });
  assert.equal(open(view.posts[1]).tab, 'failed');
  assert.equal(open(view.posts[2]).tab, 'published');
  assert.equal(open(view.drafts[0]).tab, 'draft');
  assert.deepEqual(view.links, {
    posts: `${APP.webAppUrl}/dashboard/posts?workspaceId=${WS}`,
    accounts: `${APP.webAppUrl}/dashboard/accounts?workspaceId=${WS}`,
  });
  await client.close();
});

test('the switcher list: the workspace on screen is always in it; odd rows are dropped', async () => {
  const many = Array.from({ length: 130 }, (_, i) => ({ id: `ws-${String(i).padStart(3, '0')}`, name: `W ${i}` }));
  const cases = [
    // The current workspace is missing from the list: it is added.
    [{ data: [{ id: CLIENT, name: 'Client', isPersonal: false }] }, ['Acme', 'Client']],
    // A bare array; duplicates, missing ids and non-object rows are dropped; an empty name gets a label.
    [
      [{ id: WS, name: 'Acme' }, { id: WS, name: 'Acme again' }, { name: 'no id' }, null, 42, { id: CLIENT, name: '  ' }],
      ['Acme', 'Untitled workspace'],
    ],
    // Capped at 100 from the backend's list, plus the workspace on screen.
    [{ data: many }, null],
  ];
  for (const [answer, names] of cases) {
    const { port } = appPort(calendar(), { workspaces: answer });
    const client = await connect(remote(port));
    const view = viewOf(await client.callTool({ name: 'open_postfast', arguments: {} }));
    if (names) assert.deepEqual(view.workspaces.map((w) => w.name), names);
    else {
      assert.equal(view.workspaces.length, 101);
      assert.ok(view.workspaces.some((w) => w.id === WS));
    }
    await client.close();
  }
});

test('a failing or unexpected workspace list leaves the switcher out, never the calendar', async () => {
  for (const workspaces of [
    () => Promise.reject(new Error('gateway down')),
    { ok: true },
    { data: 'nope' },
    null,
  ]) {
    const { port } = appPort(calendar(), { workspaces });
    const client = await connect(remote(port));
    const result = await client.callTool({ name: 'open_postfast', arguments: {} });
    assert.equal(result.isError, undefined);
    const view = viewOf(result);
    assert.deepEqual(view.workspaces, []);
    assert.equal(view.posts.length, 4);
    await client.close();
  }
});

test('a workspace list that hangs is given up after 5 seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { port } = appPort(calendar(), { workspaces: () => new Promise(() => {}) });
  const client = await connect(remote(port));
  const pending = client.callTool({ name: 'open_postfast', arguments: {} });
  // Let the call reach the race before moving the clock.
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(5_000);
  const view = viewOf(await pending);
  assert.deepEqual(view.workspaces, []);
  assert.equal(view.posts.length, 4);
  await client.close();
});

test('postfast_tab opens as a tab; refresh and workspaceId pass through', async () => {
  const { port, calls } = appPort();
  const client = await connect(remote(port));
  const result = await client.callTool({ name: 'postfast_tab', arguments: { refresh: true, workspaceId: WS } });
  assert.equal(viewOf(result).entrypoint, 'thread');
  assert.equal(calls[0].args[0].entrypoint, 'thread');
  assert.equal(calls[0].args[0].refresh, true);
  assert.equal(calls[0].args[1], WS);
  await client.close();
});

test('record_app_action forwards the button; an unknown one is rejected', async () => {
  const { port, calls } = appPort();
  const client = await connect(remote(port));
  const result = await client.callTool({
    name: 'record_app_action',
    arguments: { action: 'new_post_started', entrypoint: 'global', workspaceId: WS },
  });
  assert.deepEqual(result.structuredContent, { recorded: true });
  assert.deepEqual(calls, [
    { method: 'recordAppAction', args: [{ action: 'new_post_started', entrypoint: 'global' }, WS] },
  ]);
  const bad = await client.callTool({ name: 'record_app_action', arguments: { action: 'approve' } });
  assert.equal(bad.isError, true);
  assert.equal(calls.length, 1);
  await client.close();
});

test('backend errors and malformed payloads become readable tool errors', async () => {
  const failing = await connect(remote(appPort(undefined, { fail: 'Missing scope: posts:read' }).port));
  const error = await failing.callTool({ name: 'open_postfast', arguments: {} });
  assert.equal(error.isError, true);
  assert.equal(error.content[0].text, 'Missing scope: posts:read');
  assert.equal(error._meta, undefined);
  await failing.close();

  const { accounts: _dropped, ...noAccounts } = calendar();
  const malformed = await connect(remote(appPort(noAccounts).port));
  const bad = await malformed.callTool({ name: 'open_postfast', arguments: {} });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /unexpected response from PostFast/);
  await malformed.close();
});

test('results stay far below 150,000 characters: avatars go first, then far posts', async () => {
  const accounts = Array.from({ length: 150 }, (_, i) => account(i));
  const posts = Array.from({ length: 100 }, (_, i) =>
    post(i, accounts[i % 10].id, {
      content: 'y'.repeat(4_000),
      thumbnail: mediaItem(`video/${i}.mp4`, 0, { coverImageKey: `image/${i}-cover.jpg`, coverImageUrl: signed(`image/${i}-cover.jpg`) }),
    }),
  );
  const drafts = Array.from({ length: 20 }, (_, i) =>
    post(200 + i, accounts[0].id, { status: 'DRAFT', scheduledAt: null, content: 'z'.repeat(4_000) }),
  );
  const payload = { ...calendar(), accounts, posts, drafts };
  const client = await connect(remote(appPort(payload).port));
  const result = await client.callTool({ name: 'open_postfast', arguments: {} });
  const view = viewOf(result);
  assert.ok(JSON.stringify(result).length < 110_000, `result is ${JSON.stringify(result).length} chars`);
  assert.ok(JSON.stringify(view).length <= 100_000);
  assert.ok(view.accounts.slice(10).every((a) => a.avatarUrl === null), 'unused avatars dropped first');
  assert.equal(view.hasMore, true);
  assert.ok(view.posts.length < posts.length && view.posts.length > 0);
  // The dropped posts are the latest ones.
  assert.deepEqual(
    view.posts.map((p) => p.id),
    posts.slice(0, view.posts.length).map((p) => p.id),
  );
  await client.close();

  // A normal payload is never trimmed.
  const small = await connect(remote(appPort().port));
  const full = viewOf(await small.callTool({ name: 'open_postfast', arguments: {} }));
  assert.equal(full.posts.length, 4);
  assert.ok(full.accounts[0].avatarUrl);
  await small.close();
});

test('a port without the app methods registers no app tool and no resource', async () => {
  const port = new Proxy(
    {},
    {
      get: (_t, method) =>
        method === 'then' || method === 'getAppCalendar' || method === 'getAppPost' || method === 'recordAppAction'
          ? undefined
          : async () => ({}),
    },
  );
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const client = await connect(remote(port));
    const { tools } = await client.listTools();
    assert.equal(tools.length, 27);
    assert.equal(client.getServerCapabilities().resources, undefined);
    await client.close();
  } finally {
    console.error = original;
  }
  assert.equal(logged.filter((line) => line.includes('skipping tool')).length, 4);
});

test('the app tools come after the whole remote surface, confirm tools included', async () => {
  const client = await connect(remote(appPort().port));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 31);
  assert.deepEqual(names(tools).slice(24, 27), ['prepare_inbox_action', 'confirm_inbox_action', 'delete_posts']);
  assert.deepEqual(names(tools).slice(-APP_TOOLS.length), APP_TOOLS);
  await client.close();
});

test('get_calendar_post: the full post and every media item reach only _meta', async () => {
  const { port, calls } = appPort();
  const client = await connect(remote(port));
  const result = await client.callTool({ name: 'get_calendar_post', arguments: { postId: postDetail().id, workspaceId: WS } });
  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, [{ method: 'getAppPost', args: [{ postId: postDetail().id }, WS] }]);
  for (const s of [...strings(result.content), ...strings(result.structuredContent)]) {
    assert.doesNotMatch(s, /https?:\/\//);
  }
  assert.deepEqual(result.structuredContent, { postId: postDetail().id, mediaCount: 3 });
  const view = result._meta['postfast/post'];
  assert.equal(view.content, postDetail().content, 'the full text, not the 280-character caption');
  assert.equal(view.contentTruncated, false);
  assert.equal(view.firstComment, 'Link in bio!');
  assert.deepEqual(view.mediaItems, postDetail().mediaItems);
  assert.deepEqual(
    view.mediaItems.map((m) => [m.type, m.sortOrder]),
    [['IMAGE', 0], ['VIDEO', 1], ['IMAGE', 2]],
  );
  const open = new URL(view.openUrl);
  assert.equal(open.searchParams.get('editPostId'), postDetail().id);
  assert.equal(open.searchParams.get('workspaceId'), WS);
  await client.close();
});

test('get_calendar_post: huge texts are capped, bad ids and bad payloads are errors', async () => {
  const huge = await connect(remote(appPort(undefined, { detail: postDetail({ content: 'z'.repeat(60_000) }) }).port));
  const capped = (await huge.callTool({ name: 'get_calendar_post', arguments: { postId: postDetail().id } }))._meta['postfast/post'];
  assert.equal(capped.content.length, 20_000);
  assert.equal(capped.contentTruncated, true);
  await huge.close();

  const client = await connect(remote(appPort(undefined, { detail: { id: 'x' } }).port));
  const badId = await client.callTool({ name: 'get_calendar_post', arguments: { postId: 'not-a-uuid' } });
  assert.equal(badId.isError, true);
  const badPayload = await client.callTool({ name: 'get_calendar_post', arguments: { postId: postDetail().id } });
  assert.equal(badPayload.isError, true);
  assert.match(badPayload.content[0].text, /unexpected response from PostFast/);
  await client.close();
});
