// OAuth scopes on the remote binding, exercised against the built dist through
// the real SDK: every tool lists the scopes its backend call checks as
// securitySchemes, and a backend scope refusal becomes an insufficient_scope
// challenge in the tool result (RegisterToolsOptions.scopeChallenge). The
// token's scopes reach the tools as the transport's authInfo, as on the host.
// Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListToolsResultSchema, ToolSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  InsufficientScopeError,
  buildTools,
  insufficientScopeResult,
  registerCatalogTools,
} from '../dist/core/index.js';

const SECRET = 'oauth-scopes-test-confirm-secret-32';
const PRM = 'https://mcp.example.com/.well-known/oauth-protected-resource';
const ITEM = '11111111-1111-4111-8111-111111111111';
const APP = {
  mediaOrigin: 'https://media.example.com',
  domain: 'https://mcp.example.com',
  webAppUrl: 'https://app.example.com',
};
const ListedTools = ListToolsResultSchema.extend({ tools: ToolSchema.passthrough().array() });

/** The scopes the protected resource metadata advertises. */
const ADVERTISED = [
  'accounts:read',
  'posts:read',
  'posts:write',
  'posts:delete',
  'posts:approve',
  'analytics:read',
  'media:write',
  'connectlink:generate',
  'inbox:read',
  'inbox:reply',
  'inbox:manage',
];
/** A token granted every scope but the three inbox ones. */
const NO_INBOX = ADVERTISED.filter((scope) => !scope.startsWith('inbox:'));

// The scope the backend's MCP gateway checks for each tool's call, by the
// gateway command the host sends for it (in parentheses).
const EXPECTED = {
  list_posts: ['posts:read'], // list-posts
  create_posts: ['posts:write'], // create-posts
  approve_posts: ['posts:approve'], // approve-posts
  delete_post: ['posts:delete'], // delete-post
  get_post_analytics: ['analytics:read'], // get-post-analytics
  list_accounts: ['accounts:read'], // list-accounts
  list_pinterest_boards: ['accounts:read'], // list-pinterest-boards
  list_youtube_playlists: ['accounts:read'], // list-youtube-playlists
  list_gbp_locations: ['accounts:read'], // list-gbp-locations
  get_follower_history: ['analytics:read'], // get-follower-history
  search_places: ['accounts:read'], // search-places
  generate_connect_link: ['connectlink:generate'], // generate-connect-link
  list_workspaces: [], // list-workspaces: any valid token
  upload_from_url: ['media:write'], // create-upload
  upload_media: ['media:write'], // create-upload
  list_inbox_conversations: ['inbox:read'], // inbox-list-conversations
  get_inbox_conversation: ['inbox:read'], // inbox-get-conversation
  list_inbox_items: ['inbox:read'], // inbox-list-items
  get_inbox_unread_count: ['inbox:read'], // inbox-unread-count
  set_inbox_item_state: ['inbox:manage'], // inbox-set-item-state
  mark_inbox_conversation_read: ['inbox:manage'], // inbox-mark-read
  set_inbox_conversation_status: ['inbox:manage'], // inbox-set-conversation-status
  assign_inbox_conversation: ['inbox:manage'], // inbox-assign-conversation
  list_tiktok_sounds: ['accounts:read'], // list-tiktok-sounds
  preview_comment_reply: [], // no backend call
  reply_to_comment: ['inbox:reply'], // inbox-reply
  preview_private_reply: [], // no backend call
  send_private_reply: ['inbox:reply'], // inbox-private-reply
  preview_comment_deletion: [], // no backend call
  delete_comment: ['inbox:manage'], // inbox-set-item-state, DELETE
  delete_posts: ['posts:delete'], // delete-posts
  open_postfast: ['posts:read', 'accounts:read'], // app-calendar (its list-workspaces needs none)
  postfast_tab: ['posts:read', 'accounts:read'], // app-calendar (its list-workspaces needs none)
  get_calendar_post: ['posts:read'], // app-post
  record_app_action: [], // app-action: any valid token
};

/** A port where `refuse` names the methods the backend refuses for scope; every call is recorded. */
function scopedPort({ refuse = () => [] } = {}) {
  const calls = [];
  const port = new Proxy(
    {},
    {
      get: (_t, method) =>
        method === 'then'
          ? undefined
          : async (...args) => {
              calls.push(method);
              if (refuse().includes(method)) {
                throw new InsufficientScopeError('Insufficient scope: this connection is not authorized for this action.');
              }
              return { ok: true };
            },
    },
  );
  return { port, calls };
}

const remote = (port, extra = {}) => ({
  binding: 'remote',
  withWorkspaceField: true,
  port,
  confirmGate: { secret: SECRET },
  ...extra,
});

/** A client whose every request carries `scopes` as its token's authInfo, as the host's transport does. */
async function connect(options, scopes) {
  const server = new McpServer({ name: 'oauth-scopes', version: '0.0.0' }, { capabilities: { tools: {} } });
  registerCatalogTools(server, options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  if (scopes) {
    const send = clientTransport.send.bind(clientTransport);
    clientTransport.send = (message, opts) =>
      send(message, { ...opts, authInfo: { token: 'test-token', clientId: 'test-client', scopes } });
  }
  await server.connect(serverTransport);
  const client = new Client({ name: 'oauth-scopes', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

/** The auth-params of one `Bearer` challenge. */
function parseChallenge(challenge) {
  assert.match(challenge, /^Bearer [a-z_]+="[^"]*"(?:, [a-z_]+="[^"]*")*$/);
  return Object.fromEntries([...challenge.matchAll(/([a-z_]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
}

test('every remote tool lists the scopes its backend call checks, at the top level and in _meta', () => {
  const tools = buildTools({ binding: 'remote', withWorkspaceField: true, confirmGate: { secret: SECRET }, app: APP });
  assert.deepEqual(tools.map((t) => t.name).sort(), Object.keys(EXPECTED).sort());
  for (const t of tools) {
    assert.deepEqual(t.securitySchemes, [{ type: 'oauth2', scopes: EXPECTED[t.name] }], t.name);
    assert.deepEqual(t._meta.securitySchemes, t.securitySchemes, t.name);
    for (const scope of EXPECTED[t.name]) assert.ok(ADVERTISED.includes(scope), `${t.name}: ${scope}`);
  }
  // A token without the inbox scopes covers every tool but the comment ones.
  const uncovered = tools
    .filter((t) => t.securitySchemes[0].scopes.some((scope) => !NO_INBOX.includes(scope)))
    .map((t) => t.name);
  assert.deepEqual(uncovered, [
    'list_inbox_conversations',
    'get_inbox_conversation',
    'list_inbox_items',
    'get_inbox_unread_count',
    'set_inbox_item_state',
    'mark_inbox_conversation_read',
    'set_inbox_conversation_status',
    'assign_inbox_conversation',
    'reply_to_comment',
    'send_private_reply',
    'delete_comment',
  ]);
  // The remote upload_media keeps its own _meta next to the mirror.
  assert.deepEqual(tools.find((t) => t.name === 'upload_media')._meta['openai/fileParams'], ['file']);
});

test('the stdio binding lists no securitySchemes and keeps its tools as they were', async () => {
  for (const t of buildTools({ binding: 'stdio' })) {
    assert.equal(t.securitySchemes, undefined, t.name);
    assert.equal(t._meta, undefined, t.name);
  }
  const client = await connect({ binding: 'stdio', port: scopedPort().port, scopeChallenge: { resourceMetadataUrl: PRM } });
  const { tools } = await client.request({ method: 'tools/list' }, ListedTools);
  assert.equal(tools.length, 25);
  for (const t of tools) assert.ok(t.securitySchemes === undefined && t._meta === undefined, t.name);
  await client.close();
});

test('tools/list carries each tool\'s securitySchemes at the top level and in _meta', async () => {
  for (const extra of [{}, { app: APP }]) {
    const client = await connect(remote(scopedPort().port, extra));
    const { tools } = await client.request({ method: 'tools/list' }, ListedTools);
    assert.equal(tools.length, extra.app ? 35 : 31);
    for (const t of tools) {
      assert.deepEqual(t.securitySchemes, [{ type: 'oauth2', scopes: EXPECTED[t.name] }], t.name);
      assert.deepEqual(t._meta.securitySchemes, t.securitySchemes, t.name);
    }
    // The app's entrypoints keep their icons beside it.
    const withIcons = tools.filter((t) => t.icons).map((t) => t.name);
    assert.deepEqual(withIcons, extra.app ? ['open_postfast', 'postfast_tab'] : []);
    // Negative control: the SDK's own listTools() drops the top-level field, which is why the raw list is read.
    const parsed = await client.listTools();
    assert.ok(parsed.tools.every((t) => t.securitySchemes === undefined));
    await client.close();
  }
});

test('insufficientScopeResult builds the documented challenge', () => {
  const result = insufficientScopeResult({ resourceMetadataUrl: PRM, scopes: ['inbox:read'], grantedScopes: NO_INBOX });
  assert.deepEqual(result, {
    content: [
      {
        type: 'text',
        text: "This connection doesn't have permission for this action yet: it needs the inbox:read permission. Reconnect PostFast and allow it, then try again.",
      },
    ],
    isError: true,
    _meta: {
      'mcp/www_authenticate': [
        `Bearer resource_metadata="${PRM}", error="insufficient_scope", error_description="This action needs the inbox:read permission", scope="${[...NO_INBOX, 'inbox:read'].join(' ')}"`,
      ],
    },
  });
  const params = parseChallenge(result._meta['mcp/www_authenticate'][0]);
  assert.deepEqual(Object.keys(params), ['resource_metadata', 'error', 'error_description', 'scope']);
  // RFC 6750: error_description and scope use only these characters.
  assert.match(params.error_description, /^[\x20-\x21\x23-\x5B\x5D-\x7E]+$/);
  for (const scope of params.scope.split(' ')) assert.match(scope, /^[\x21\x23-\x5B\x5D-\x7E]+$/);

  // Without the token's scopes, the challenge names what is needed but asks for no scope set.
  const unknown = insufficientScopeResult({ resourceMetadataUrl: PRM, scopes: ['posts:read', 'accounts:read'] });
  assert.deepEqual(unknown._meta['mcp/www_authenticate'], [
    `Bearer resource_metadata="${PRM}", error="insufficient_scope", error_description="This action needs the posts:read, accounts:read permissions"`,
  ]);
  // A scope value that could break the header is left out of it.
  const odd = insufficientScopeResult({
    resourceMetadataUrl: PRM,
    scopes: ['inbox:read', 'x"y', 'a b'],
    grantedScopes: ['posts:read', 'bad"scope', 'ctl\x01'],
  });
  assert.equal(parseChallenge(odd._meta['mcp/www_authenticate'][0]).scope, 'posts:read inbox:read');
  // No scope to name: a generic description and no empty scope parameter.
  for (const grantedScopes of [undefined, []]) {
    const none = insufficientScopeResult({ resourceMetadataUrl: PRM, scopes: [], grantedScopes });
    assert.deepEqual(none._meta['mcp/www_authenticate'], [
      `Bearer resource_metadata="${PRM}", error="insufficient_scope", error_description="This action needs more permissions"`,
    ]);
    assert.match(none.content[0].text, /it needs more permissions\./);
  }
  // The metadata URL is checked here too, since hosts may call this directly.
  assert.throws(
    () => insufficientScopeResult({ resourceMetadataUrl: `${PRM}"`, scopes: ['inbox:read'] }),
    /resourceMetadataUrl must be an https URL/,
  );
});

test('a backend scope refusal becomes the challenge, asking for the token\'s scopes and the tool\'s', async () => {
  const { port } = scopedPort({ refuse: () => ['listInboxConversations', 'getInboxUnreadCount', 'listAccounts'] });
  const client = await connect(remote(port, { scopeChallenge: { resourceMetadataUrl: PRM } }), NO_INBOX);
  const result = await client.callTool({ name: 'list_inbox_conversations', arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /it needs the inbox:read permission\. Reconnect PostFast and allow it/);
  const params = parseChallenge(result._meta['mcp/www_authenticate'][0]);
  assert.equal(params.resource_metadata, PRM);
  assert.equal(params.error, 'insufficient_scope');
  assert.equal(params.scope, [...NO_INBOX, 'inbox:read'].join(' '));

  // A refusal for a scope the token already has can't be fixed by asking again: a plain error.
  const covered = await client.callTool({ name: 'list_accounts', arguments: {} });
  assert.deepEqual(covered, {
    content: [{ type: 'text', text: 'Insufficient scope: this connection is not authorized for this action.' }],
    isError: true,
  });
  await client.close();
});

test('without scopeChallenge, or on stdio, a scope refusal stays the plain error it was', async () => {
  const refuse = () => ['getInboxUnreadCount'];
  for (const options of [
    remote(scopedPort({ refuse }).port),
    { binding: 'stdio', port: scopedPort({ refuse }).port, scopeChallenge: { resourceMetadataUrl: PRM } },
  ]) {
    const client = await connect(options, NO_INBOX);
    const result = await client.callTool({ name: 'get_inbox_unread_count', arguments: {} });
    assert.deepEqual(result, {
      content: [{ type: 'text', text: 'Insufficient scope: this connection is not authorized for this action.' }],
      isError: true,
    });
    await client.close();
  }
});

test('without the token\'s scopes the challenge still names the tool\'s; other errors stay plain', async () => {
  let error = new InsufficientScopeError();
  const port = new Proxy({}, { get: (_t, m) => (m === 'then' ? undefined : async () => { throw error; }) });
  const client = await connect(remote(port, { scopeChallenge: { resourceMetadataUrl: PRM } }));
  const result = await client.callTool({ name: 'get_inbox_unread_count', arguments: {} });
  assert.deepEqual(result._meta['mcp/www_authenticate'], [
    `Bearer resource_metadata="${PRM}", error="insufficient_scope", error_description="This action needs the inbox:read permission"`,
  ]);
  // An error from a second copy of the catalogue counts by its name.
  error = Object.assign(new Error('refused'), { name: 'InsufficientScopeError' });
  assert.ok((await client.callTool({ name: 'get_inbox_unread_count', arguments: {} }))._meta);
  // Anything else is the error's own message, as before.
  error = new Error('inbox.rateLimited');
  assert.deepEqual(await client.callTool({ name: 'get_inbox_unread_count', arguments: {} }), {
    content: [{ type: 'text', text: 'inbox.rateLimited' }],
    isError: true,
  });
  // A tool that needs no scope has nothing to ask for.
  error = new InsufficientScopeError();
  const workspaces = await client.callTool({ name: 'list_workspaces', arguments: {} });
  assert.equal(workspaces._meta, undefined);
  assert.equal(workspaces.isError, true);
  await client.close();
});

test('a reply refused for scope keeps its token, so it goes through once the scope is granted', async () => {
  let granted = false;
  const { port, calls } = scopedPort({ refuse: () => (granted ? [] : ['replyToInboxItem']) });
  const scopes = [...NO_INBOX, 'inbox:read'];
  const client = await connect(remote(port, { scopeChallenge: { resourceMetadataUrl: PRM } }), scopes);
  const preview = await client.callTool({ name: 'preview_comment_reply', arguments: { itemId: ITEM, text: 'thanks!' } });
  assert.equal(preview.isError, undefined);
  const args = { confirmToken: preview.structuredContent.confirmToken, itemId: ITEM, text: 'thanks!' };

  const refused = await client.callTool({ name: 'reply_to_comment', arguments: args });
  assert.equal(parseChallenge(refused._meta['mcp/www_authenticate'][0]).scope, [...scopes, 'inbox:reply'].join(' '));

  granted = true;
  const sent = await client.callTool({ name: 'reply_to_comment', arguments: args });
  assert.equal(sent.isError, undefined);
  assert.deepEqual(sent.structuredContent, { ok: true });
  assert.deepEqual(calls, ['replyToInboxItem', 'replyToInboxItem']);
  // And then the token is spent.
  const again = await client.callTool({ name: 'reply_to_comment', arguments: args });
  assert.equal(again.content[0].text, 'This confirmToken was already used.');
  await client.close();
});

test('scopeChallenge needs an https metadata URL that is safe in a header', () => {
  const register = (resourceMetadataUrl) =>
    registerCatalogTools(new McpServer({ name: 't', version: '0.0.0' }), {
      ...remote(scopedPort().port),
      scopeChallenge: { resourceMetadataUrl },
    });
  for (const bad of [
    'http://mcp.example.com/.well-known/oauth-protected-resource',
    'mcp.example.com',
    `${PRM}"x`,
    `${PRM} x`,
    `${PRM}\\x`,
    `${PRM}\x01`,
    `${PRM}\x7f`,
    `${PRM}é`,
    '',
    undefined,
  ]) {
    assert.throws(() => register(bad), /scopeChallenge\.resourceMetadataUrl must be an https URL/, String(bad));
  }
  assert.doesNotThrow(() => register(PRM));
  assert.doesNotThrow(() => register('http://localhost:5109/.well-known/oauth-protected-resource/mcp'));
});
