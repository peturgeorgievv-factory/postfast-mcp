#!/usr/bin/env node
// Serves the calendar app locally for the ext-apps basic-host: the built
// catalog with the app on, over stateless Streamable HTTP like the deployed
// host, with fictional fixture data. Media comes from a second origin so the
// view's CSP (resourceDomains) is exercised.
//
//   npm run build && node scripts/app-preview.mjs
//
// MCP endpoints, one per scenario: http://localhost:3001/<scenario>/mcp where
// <scenario> is full, no-accounts, no-posts, error, or no-detail (a backend
// without post details, so the view falls back to list_posts). Media:
// localhost:3002.
// PREVIEW_VIDEO=/path/to/clip.mp4 serves a real video for every video post
// (otherwise videos show their cover image, or a fallback when they have none).

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { instructionsFor, registerCatalogTools } from '../dist/core/index.js';

const MCP_PORT = Number(process.env.PORT ?? 3001);
const MEDIA_PORT = Number(process.env.MEDIA_PORT ?? 3002);
const MEDIA = `http://localhost:${MEDIA_PORT}`;
const APP = { mediaOrigin: MEDIA, domain: `http://localhost:${MCP_PORT}`, webAppUrl: 'https://app.postfa.st' };
const SCENARIOS = ['full', 'no-accounts', 'no-posts', 'error', 'no-detail', 'many', 'single'];
const WORKSPACE = { id: '7a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', name: 'Northwind Coffee' };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Today at hh:mm local time, plus whole days. */
function at(days, hh, mm = 0) {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return new Date(d.getTime() + days * DAY).toISOString();
}

const accounts = [
  { platform: 'INSTAGRAM', platformUsername: 'northwind.coffee', displayName: 'Northwind Coffee', avatar: 'a1' },
  { platform: 'FACEBOOK', platformUsername: null, displayName: 'Northwind Coffee Roasters', avatar: 'a2' },
  { platform: 'X', platformUsername: 'northwindcoffee', displayName: 'Northwind', avatar: null },
  { platform: 'LINKEDIN', platformUsername: null, displayName: 'Northwind Coffee Co.', avatar: 'a4' },
  { platform: 'TIKTOK', platformUsername: 'northwind.brews', displayName: 'Northwind Brews', avatar: 'a5', disabled: true },
  { platform: 'YOUTUBE', platformUsername: null, displayName: 'Northwind Coffee TV', avatar: 'a6' },
].map((a, i) => ({
  id: uuid(100 + i),
  platform: a.platform,
  platformUsername: a.platformUsername,
  displayName: a.displayName,
  connectionStatus: a.disabled ? 'DISABLED' : 'CONNECTED',
  disabledReason: a.disabled ? 'TOKEN_REVOKED' : null,
  avatarUrl: a.avatar ? `${MEDIA}/avatars/${a.avatar}.svg` : null,
}));
const [ig, fb, x, li, tt, yt] = accounts;

/** A media item in the API's usual shape, with display URLs from the media server. */
const item = (type, name, sortOrder = 0, cover = true) => ({
  type,
  key: `${type === 'VIDEO' ? 'video' : 'image'}/${name}.${type === 'VIDEO' ? 'mp4' : 'svg'}`,
  sortOrder,
  coverImageKey: type === 'VIDEO' && cover ? `image/${name}-cover.svg` : null,
  coverTimestamp: null,
  mediaUrl: `${MEDIA}/${type === 'VIDEO' ? 'video' : 'image'}/${name}.${type === 'VIDEO' ? 'mp4' : 'svg'}`,
  coverImageUrl: type === 'VIDEO' && cover ? `${MEDIA}/image/${name}-cover.svg` : null,
});
const image = (name) => [item('IMAGE', name)];
const images = (name, count) => Array.from({ length: count }, (_, i) => item('IMAGE', `${name}-${i + 1}`, i));
const video = (name, poster = true) => [item('VIDEO', name, 0, poster)];

let n = 0;
/** A calendar post; `media` holds every item, the calendar shows the first. */
const post = (account, { media = [], firstComment = null, ...fields }) => ({
  id: uuid(++n),
  socialMediaId: account.id,
  status: 'SCHEDULED',
  approvalStatus: 'APPROVED',
  scheduledAt: null,
  publishedAt: null,
  content: '',
  lastError: null,
  mediaCount: media.length,
  thumbnail: media[0] ?? null,
  ...fields,
  // Kept for getAppPost; stripped from the calendar answer.
  _full: { firstComment, mediaItems: media },
});

function fullCalendar() {
  n = 0;
  return {
    workspace: WORKSPACE,
    accounts,
    posts: [
      post(ig, {
        status: 'PUBLISHED',
        scheduledAt: at(-2, 9),
        publishedAt: at(-2, 9),
        content: 'Monday mornings call for a flat white and a fresh batch of cinnamon rolls. See you at the counter ☕️',
        media: image('latte'),
      }),
      post(x, {
        status: 'PUBLISHED',
        scheduledAt: at(-2, 12, 30),
        publishedAt: at(-2, 12, 31),
        content: 'Our Ethiopia Guji is back on the shelf. Floral, bright, and gone by Friday if last month is anything to go by.',
      }),
      post(tt, {
        status: 'FAILED',
        scheduledAt: at(-1, 17),
        content: 'Behind the scenes: roasting day in 30 seconds.',
        media: video('roast'),
        lastError: { message: 'Social media account is disconnected', code: 'MISSED_DISCONNECTED' },
      }),
      post(li, {
        status: 'FAILED',
        scheduledAt: at(-1, 10),
        content: 'We are hiring a head roaster for our new production site. Five years of specialty roasting experience preferred.',
        media: image('team'),
        lastError: { message: 'LinkedIn rejected the image: it is larger than 5 MB.', code: 'MEDIA_TOO_LARGE' },
      }),
      post(x, {
        status: 'PROCESSING',
        scheduledAt: at(0, new Date().getHours(), 0),
        content: 'Doors open in 10 minutes. First 20 guests get a free pastry with any pour-over.',
      }),
      post(ig, {
        scheduledAt: at(0, 18),
        content:
          'New season, new menu 🍂 Maple oat latte, cardamom cold brew and our first ever pumpkin cruffin. Which one are you trying first? Tell us below and tag a friend who needs a coffee date this week.\n\n' +
          'The maple oat latte is our autumn signature: a double shot of our Ethiopia Guji, steamed oat milk and a spoon of Vermont maple syrup, finished with cinnamon on top. The cardamom cold brew steeps for 18 hours and comes over ice with a splash of cardamom syrup and cream.\n\n' +
          'And the pumpkin cruffin: croissant dough rolled in cinnamon sugar and filled with spiced pumpkin cream. We bake 40 a day, so come early.\n\n' +
          '#northwindcoffee #autumnmenu #maplelatte #coldbrew #cruffin #specialtycoffee',
        media: images('menu', 3),
        firstComment: 'Menu and prices are in the link in our bio 🍁',
      }),
      post(fb, {
        scheduledAt: at(0, 20),
        approvalStatus: 'PENDING_APPROVAL',
        content: 'Live latte art class this Saturday! Only 12 seats. Book through the link in our bio.',
        media: video('latte-art'),
      }),
      post(li, {
        scheduledAt: at(1, 8, 30),
        content: 'How we cut our roastery energy use by 30% this year, and what we learned along the way.',
      }),
      post(tt, {
        scheduledAt: at(1, 16),
        content: 'Rate our new cup design from 1 to 10 👇',
        media: image('cups'),
      }),
      post(yt, {
        scheduledAt: at(1, 19),
        content: 'Home espresso 101: dialing in your grinder in five minutes.',
        media: video('espresso', false),
      }),
      post(ig, {
        scheduledAt: at(3, 9),
        approvalStatus: 'NEEDS_WORK',
        content: 'Throwback to our very first market stall in 2019.',
        media: image('market'),
      }),
      post(x, {
        scheduledAt: at(3, 15),
        approvalStatus: 'REJECTED',
        content: 'Hot take: cold brew is better in winter.',
      }),
      post(fb, {
        scheduledAt: at(6, 11),
        approvalStatus: 'IN_PROGRESS',
        content: 'Our holiday gift boxes are here: two bags, one mug and a handwritten note. Order by the 15th for delivery before the holidays.',
        media: images('gift', 4),
      }),
      post(ig, {
        scheduledAt: at(9, 10),
        content: 'Meet Sam, our new barista trainer.',
        media: image('sam'),
      }),
    ],
    drafts: [
      post(ig, {
        status: 'DRAFT',
        content: 'Idea: a "guess the origin" blind tasting series for Stories.',
        media: image('tasting'),
      }),
      post(li, { status: 'DRAFT', content: '' }),
    ],
    hasMore: false,
    draftsHasMore: false,
  };
}

const strip = ({ _full, ...rest }) => rest;
const stripCalendar = (c) => ({ ...c, posts: c.posts.map(strip), drafts: c.drafts.map(strip) });

// More workspaces for the switcher. Each calendar numbers its posts in its own
// range, so a post id finds the right post across workspaces.
const OTHER = {
  personal: { id: uuid(900), name: 'Personal', isPersonal: true },
  lopema: { id: uuid(901), name: 'Lopema Real Estate — client portfolio, listings and open houses', isPersonal: false },
  empty: { id: uuid(902), name: 'Empty workspace', isPersonal: false },
  paused: { id: uuid(903), name: 'Paused Client', isPersonal: false },
};

const makeAccount = (i, platform, username, displayName, avatar = null, disabled = false) => ({
  id: uuid(i),
  platform,
  platformUsername: username,
  displayName,
  connectionStatus: disabled ? 'DISABLED' : 'CONNECTED',
  disabledReason: disabled ? 'TOKEN_REVOKED' : null,
  avatarUrl: avatar ? `${MEDIA}/avatars/${avatar}.svg` : null,
});

function personalCalendar() {
  n = 500;
  const me = makeAccount(910, 'X', 'petar_dev', 'Petar', 'a1');
  const sky = makeAccount(911, 'BLUESKY', 'petar.bsky.social', 'Petar');
  return {
    workspace: { id: OTHER.personal.id, name: OTHER.personal.name },
    accounts: [me, sky],
    posts: [
      post(me, { scheduledAt: at(1, 9), content: 'Shipping the calendar today.' }),
      post(sky, { scheduledAt: at(3, 11), content: 'Weekend reading list: three posts on MCP apps.' }),
    ],
    drafts: [post(me, { status: 'DRAFT', content: 'A thread on building MCP apps.', media: images('cups', 3) })],
    hasMore: false,
    draftsHasMore: false,
  };
}

function lopemaCalendar() {
  n = 600;
  const insta = makeAccount(920, 'INSTAGRAM', 'lopemaestate', 'Lopema', 'a4');
  const threads = makeAccount(921, 'THREADS', 'lopemaestate', 'Lopema');
  return {
    workspace: { id: OTHER.lopema.id, name: OTHER.lopema.name },
    accounts: [insta, threads],
    posts: [
      post(insta, { scheduledAt: at(2, 10), content: 'Open house this Saturday: three bedrooms and a garden.', media: images('market', 4) }),
    ],
    drafts: [],
    hasMore: false,
    draftsHasMore: false,
  };
}

const emptyCalendar = () => ({
  workspace: { id: OTHER.empty.id, name: OTHER.empty.name },
  accounts: [],
  posts: [],
  drafts: [],
  hasMore: false,
  draftsHasMore: false,
});

// The "many" scenario: 30 workspaces and 40 accounts, some named in Cyrillic.
const KINDS = ['Bakery', 'Gym', 'Studio', 'Florist', 'Dental', 'Hotel'];
const MANY_WORKSPACES = [
  { ...WORKSPACE, isPersonal: false },
  { id: uuid(1001), name: 'Personal', isPersonal: true },
  { id: uuid(1002), name: 'Кафе София', isPersonal: false },
  { id: uuid(1003), name: 'Петър Георгиев', isPersonal: false },
  ...Array.from({ length: 26 }, (_, i) => ({
    id: uuid(1004 + i),
    name: `Client ${String(i + 4).padStart(2, '0')} — ${KINDS[i % KINDS.length]}`,
    isPersonal: false,
  })),
];
const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'X', 'LINKEDIN', 'TIKTOK', 'YOUTUBE', 'THREADS', 'BLUESKY', 'PINTEREST', 'TELEGRAM'];

function manyCalendar(workspace) {
  n = 700;
  const list = Array.from({ length: 40 }, (_, i) => {
    const platform = PLATFORMS[i % PLATFORMS.length];
    if (i === 3) return makeAccount(1100 + i, 'GOOGLE_BUSINESS_PROFILE', null, 'Петър Георгиев', 'a2');
    if (i === 7) return makeAccount(1100 + i, 'FACEBOOK', null, 'Кафе София', 'a5');
    return makeAccount(1100 + i, platform, `brand${String(i).padStart(2, '0')}.${platform.toLowerCase()}`, `Brand ${i}`, i % 3 ? 'a6' : null, i === 9);
  });
  return {
    workspace: { id: workspace.id, name: workspace.name },
    accounts: list,
    posts: list.slice(0, 8).map((a, i) =>
      post(a, { scheduledAt: at(i % 5, 9 + i), content: `Planned post ${i + 1} for ${a.displayName}.`, media: i % 2 ? image('latte') : [] }),
    ),
    drafts: [post(list[3], { status: 'DRAFT', content: 'Чернова: есенно меню.' })],
    hasMore: false,
    draftsHasMore: false,
  };
}

function calendarFor(scenario) {
  const full = fullCalendar();
  const calendar = stripCalendar(full);
  if (scenario === 'no-accounts') return { ...calendar, accounts: [], posts: [], drafts: [] };
  if (scenario === 'no-posts') return { ...calendar, posts: [], drafts: [] };
  return calendar;
}

function findPost(id) {
  for (const calendar of [fullCalendar(), personalCalendar(), lopemaCalendar(), manyCalendar(WORKSPACE)]) {
    const found = [...calendar.posts, ...calendar.drafts].find((p) => p.id === id);
    if (found) return { post: found, workspaceId: calendar.workspace.id };
  }
  return undefined;
}

/** getAppPost: the post in full, every media item included. */
function postDetailFor(id) {
  const found = findPost(id);
  if (!found) throw new Error('This post no longer exists. (socialPost.notFound)');
  const { _full, thumbnail: _thumbnail, ...rest } = found.post;
  return { ...rest, workspaceId: found.workspaceId, firstComment: _full.firstComment, mediaItems: _full.mediaItems };
}

/** getAppCalendar for one workspace of a scenario; unknown workspaces are refused. */
function workspaceCalendar(scenario, workspaceId) {
  const ws = workspaceId ?? WORKSPACE.id;
  if (scenario === 'many') {
    const workspace = MANY_WORKSPACES.find((w) => w.id === ws);
    if (!workspace) throw new Error('You are not a member of this workspace. (workspace.notMember)');
    return stripCalendar(manyCalendar(workspace));
  }
  if (ws === WORKSPACE.id) return calendarFor(scenario);
  if (ws === OTHER.personal.id) return stripCalendar(personalCalendar());
  if (ws === OTHER.lopema.id) return stripCalendar(lopemaCalendar());
  if (ws === OTHER.empty.id) return emptyCalendar();
  if (ws === OTHER.paused.id) {
    throw new Error('This workspace has no active plan. (subscription.required)');
  }
  throw new Error('You are not a member of this workspace. (workspace.notMember)');
}

/** list_workspaces as the gateway answers it. */
function workspacesFor(scenario) {
  if (scenario === 'single') return { data: [{ ...WORKSPACE, isPersonal: false }] };
  if (scenario === 'many') return { data: MANY_WORKSPACES };
  return { data: [{ ...WORKSPACE, isPersonal: false }, ...Object.values(OTHER)] };
}

/** list_posts by id, as the gateway answers it: keys only, no display URLs. */
function listPostsFor(ids = []) {
  const data = ids.map(findPost).filter(Boolean).map(({ post: p }) => {
    const { _full, thumbnail: _thumbnail, ...rest } = p;
    return { ...rest, firstComment: _full.firstComment, mediaItems: _full.mediaItems.map(({ type, key, sortOrder }) => ({ type, key, sortOrder })) };
  });
  return { data, totalCount: data.length, pageInfo: { page: 1, hasNextPage: false, perPage: data.length } };
}

function portFor(scenario) {
  return new Proxy(
    {},
    {
      get: (_t, method) => {
        if (method === 'then') return undefined;
        // A backend without post details: the catalog skips get_calendar_post.
        if (method === 'getAppPost' && scenario === 'no-detail') return undefined;
        return async (args, workspaceId) => {
          console.log(`[${scenario}] ${String(method)} ${JSON.stringify(args ?? {})} ws=${workspaceId ?? 'default'}`);
          if (method === 'getAppCalendar') {
            if (scenario === 'error') throw new Error('Missing scope: posts:read. Reconnect PostFast and allow reading posts.');
            return workspaceCalendar(scenario, workspaceId);
          }
          if (method === 'listWorkspaces') return workspacesFor(scenario);
          if (method === 'getAppPost') return postDetailFor(args.postId);
          if (method === 'listPosts') return listPostsFor(args.ids);
          if (method === 'generateConnectLink') return { connectUrl: 'https://app.postfa.st/connect?token=preview' };
          return {};
        };
      },
    },
  );
}

/**
 * basic-host offers only tools the model can see, and the app tools are
 * app-only; the host that runs the app opens them from its sidebar and
 * conversation tabs instead. Preview only: list the two entrypoints as
 * model-visible so basic-host can call them.
 */
function showEntrypointsToBasicHost(server) {
  const handlers = server.server._requestHandlers;
  const list = handlers.get('tools/list');
  handlers.set('tools/list', async (request, extra) => {
    const result = await list(request, extra);
    for (const tool of result.tools) {
      if (tool.name === 'open_postfast' || tool.name === 'postfast_tab') {
        tool._meta = { ...tool._meta, ui: { ...tool._meta.ui, visibility: ['model', 'app'] } };
      }
    }
    return result;
  });
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers':
    'content-type, accept, authorization, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

createServer(async (req, res) => {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const match = /^\/([a-z-]+)\/mcp\/?$/.exec(new URL(req.url, 'http://x').pathname);
  const scenario = match?.[1];
  if (!scenario || !SCENARIOS.includes(scenario)) {
    return res.writeHead(404, { 'content-type': 'text/plain' }).end(`Try /${SCENARIOS.join('/mcp, /')}/mcp\n`);
  }
  if (req.method !== 'POST') return res.writeHead(405, { allow: 'POST' }).end();
  try {
    const body = await readBody(req);
    const server = new McpServer(
      { name: `postfast-preview-${scenario}`, version: '0.0.0' },
      { capabilities: { tools: {}, logging: {} }, instructions: instructionsFor('remote') },
    );
    registerCatalogTools(server, {
      binding: 'remote',
      withWorkspaceField: true,
      port: portFor(scenario),
      confirmGate: { secret: 'app-preview-confirm-secret-32chars' },
      app: APP,
    });
    showEntrypointsToBasicHost(server);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }));
  }
}).listen(MCP_PORT, () => {
  console.log(`MCP: ${SCENARIOS.map((s) => `http://localhost:${MCP_PORT}/${s}/mcp`).join('  ')}`);
});

// Media: generated SVG stills and avatars; the video only with PREVIEW_VIDEO.
const HUES = { latte: 28, team: 210, menu: 18, 'latte-art': 35, cups: 330, market: 95, gift: 0, sam: 190, tasting: 265, roast: 12, espresso: 45 };

function stillSvg(name) {
  const [, base, index] = /^(.*?)(?:-(\d+))?(?:-cover)?$/.exec(name);
  const hue = ((HUES[base] ?? 200) + (Number(index ?? 1) - 1) * 38) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 60% 32%)"/></linearGradient></defs>
<rect width="320" height="320" fill="url(#g)"/><circle cx="210" cy="120" r="70" fill="rgba(255,255,255,.22)"/>
<rect x="40" y="200" width="170" height="70" rx="14" fill="rgba(255,255,255,.28)"/></svg>`;
}

function avatarSvg(name) {
  const hue = { a1: 20, a2: 215, a4: 200, a5: 330, a6: 0 }[name] ?? 160;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<rect width="96" height="96" fill="hsl(${hue} 55% 45%)"/><circle cx="48" cy="40" r="17" fill="rgba(255,255,255,.85)"/>
<path d="M16 92c4-20 18-30 32-30s28 10 32 30z" fill="rgba(255,255,255,.85)"/></svg>`;
}

createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  let m;
  if ((m = /^\/image\/([\w-]+)\.svg$/.exec(path))) {
    return res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(stillSvg(m[1]));
  }
  if ((m = /^\/avatars\/(\w+)\.svg$/.exec(path))) {
    return res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(avatarSvg(m[1]));
  }
  if (/^\/video\/[\w-]+\.mp4$/.test(path) && process.env.PREVIEW_VIDEO) {
    return res.writeHead(200, { 'content-type': 'video/mp4' }).end(readFileSync(process.env.PREVIEW_VIDEO));
  }
  res.writeHead(404).end();
}).listen(MEDIA_PORT, () => console.log(`Media: ${MEDIA}`));
