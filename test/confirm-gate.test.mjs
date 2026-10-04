// The remote binding's confirmation rules, exercised against the built dist:
// posts are held until approve_posts, and comment replies and deletions go
// through signed prepare/confirm tokens (BuildToolsOptions.confirmGate). The
// stdio binding keeps direct publishing and replies. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { SERVER_INSTRUCTIONS, buildTools, instructionsFor } from '../dist/core/index.js';
import { redeem, sign } from '../dist/core/confirm-token.js';

const SECRET = 'confirm-gate-test-secret-32chars';
const ITEM = '11111111-1111-4111-8111-111111111111';
const OTHER_ITEM = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';
const OTHER_WS = '44444444-4444-4444-8444-444444444444';
const REPLY = { itemId: ITEM, action: 'REPLY', text: 'thanks!' };

/** A port that records every call and answers with a marker result. */
function recordingPort({ delayMs = 0, fail } = {}) {
  const calls = [];
  const port = new Proxy(
    {},
    {
      get: (_t, method) =>
        method === 'then'
          ? undefined
          : async (...args) => {
              calls.push({ method, args });
              if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
              if (fail?.()) throw new Error('inbox.rateLimited');
              return { ok: true, method };
            },
    },
  );
  return { port, calls };
}

const gatedTools = (port) =>
  buildTools({ binding: 'remote', withWorkspaceField: true, port, confirmGate: { secret: SECRET } });
const remoteWithoutSecret = (port) => buildTools({ binding: 'remote', withWorkspaceField: true, port });
const stdioTools = (port) => buildTools({ binding: 'stdio', port });
const tool = (tools, name) => tools.find((t) => t.name === name);
const prepare = (port, args, ws) => tool(gatedTools(port), 'prepare_inbox_action').run(port, args, ws);
const confirm = (port, args, ws) => tool(gatedTools(port), 'confirm_inbox_action').run(port, args, ws);
const parse = (t, args) => z.object(t.inputSchema).safeParse(args);

test('prepare returns a preview and a token and calls no port method', async () => {
  const { port, calls } = recordingPort();
  const out = await prepare(port, REPLY, WS);
  assert.deepEqual(out.preview, { action: 'REPLY', itemId: ITEM, text: 'thanks!', workspaceId: WS });
  assert.match(out.confirmToken, /^v1\.\d{10}\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  assert.ok(Date.parse(out.expiresAt) > Date.now());
  assert.match(out.next, /confirm_inbox_action/);
  // DELETE drops any text; no workspaceId passed means no workspaceId key.
  const del = await prepare(port, { itemId: ITEM, action: 'DELETE', text: 'ignored' }, undefined);
  assert.deepEqual(del.preview, { action: 'DELETE', itemId: ITEM });
  assert.equal(calls.length, 0);
});

test('prepare rejects REPLY and PRIVATE_REPLY without text', async () => {
  const { port } = recordingPort();
  for (const action of ['REPLY', 'PRIVATE_REPLY']) {
    await assert.rejects(
      prepare(port, { itemId: ITEM, action }, WS),
      /^Error: text is required for REPLY and PRIVATE_REPLY\.$/,
    );
  }
});

const DISPATCH = {
  REPLY: ['replyToInboxItem', [{ itemId: ITEM, text: 'thanks!' }, WS]],
  PRIVATE_REPLY: ['sendInboxPrivateReply', [{ itemId: ITEM, text: 'thanks!' }, WS]],
  DELETE: ['setInboxItemState', [{ itemId: ITEM, action: 'DELETE' }, WS]],
};
for (const [action, [method, args]] of Object.entries(DISPATCH)) {
  test(`confirm ${action} calls ${method} exactly once with the exact args`, async () => {
    const { port, calls } = recordingPort();
    const text = action === 'DELETE' ? undefined : 'thanks!';
    const { confirmToken } = await prepare(port, { itemId: ITEM, action, text }, WS);
    const result = await confirm(port, { confirmToken, itemId: ITEM, action, text }, WS);
    assert.deepEqual(calls, [{ method, args }]);
    assert.deepEqual(result, { ok: true, method });
  });
}

test('confirm rejects a changed text, itemId, action or workspaceId', async () => {
  const { port, calls } = recordingPort();
  const { confirmToken } = await prepare(port, REPLY, WS);
  const changed = [
    [{ ...REPLY, text: 'thanks' }, WS],
    [{ ...REPLY, itemId: OTHER_ITEM }, WS],
    [{ ...REPLY, action: 'PRIVATE_REPLY' }, WS],
    [REPLY, OTHER_WS],
    [REPLY, undefined],
  ];
  for (const [args, ws] of changed) {
    await assert.rejects(confirm(port, { confirmToken, ...args }, ws), /^Error: confirmToken does not match this action\. Prepare it again with prepare_inbox_action and confirm exactly what was previewed\.$/);
  }
  assert.equal(calls.length, 0);
  // A rejected attempt does not use the token up.
  await confirm(port, { confirmToken, ...REPLY }, WS);
  assert.equal(calls.length, 1);
});

test('confirm rejects a tampered signature, another secret and malformed tokens', async () => {
  const { port, calls } = recordingPort();
  const { confirmToken } = await prepare(port, REPLY, WS);
  const tampered = confirmToken.slice(0, -1) + (confirmToken.endsWith('A') ? 'B' : 'A');
  const foreign = sign({ ws: WS, ...REPLY }, 'a-different-secret-also-32-chars').confirmToken;
  for (const bad of [tampered, foreign, '', 'v1', `v2${confirmToken.slice(2)}`, `${confirmToken}.x`]) {
    await assert.rejects(confirm(port, { confirmToken: bad, ...REPLY }, WS), /does not match this action/);
  }
  assert.equal(calls.length, 0);
});

test('confirm rejects an expired token and a reused one', async () => {
  const { port, calls } = recordingPort();
  const stale = sign({ ws: WS, ...REPLY }, SECRET, Date.now() - 901_000).confirmToken;
  await assert.rejects(confirm(port, { confirmToken: stale, ...REPLY }, WS), /^Error: confirmToken has expired\. Prepare the action again\.$/);
  const { confirmToken } = await prepare(port, REPLY, WS);
  await confirm(port, { confirmToken, ...REPLY }, WS);
  await assert.rejects(confirm(port, { confirmToken, ...REPLY }, WS), /^Error: This confirmToken was already used\.$/);
  assert.equal(calls.length, 1);
});

test('expiry is in seconds: a token verifies at +899 s and is expired at +901 s', () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0, 500);
  const fields = { ws: WS, itemId: ITEM, action: 'DELETE' };
  const signed = sign(fields, SECRET, now);
  assert.equal(signed.expiresAt, '2026-09-24T12:15:00.000Z');
  assert.doesNotThrow(() => redeem(signed.confirmToken, fields, SECRET, now + 899_000));
  assert.throws(() => redeem(sign(fields, SECRET, now).confirmToken, fields, SECRET, now + 901_000), /expired/);
});

test('two concurrent confirms with the same token make exactly one port call', async () => {
  const { port, calls } = recordingPort({ delayMs: 20 });
  const { confirmToken } = await prepare(port, REPLY, WS);
  const results = await Promise.allSettled([
    confirm(port, { confirmToken, ...REPLY }, WS),
    confirm(port, { confirmToken, ...REPLY }, WS),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.match(results.find((r) => r.status === 'rejected').reason.message, /already used/);
  assert.equal(calls.length, 1);
});

test('a failed platform call releases the token so the same confirm can retry', async () => {
  let failing = true;
  const { port, calls } = recordingPort({ fail: () => failing });
  const { confirmToken } = await prepare(port, REPLY, WS);
  await assert.rejects(confirm(port, { confirmToken, ...REPLY }, WS), /inbox\.rateLimited/);
  failing = false;
  assert.deepEqual(await confirm(port, { confirmToken, ...REPLY }, WS), { ok: true, method: 'replyToInboxItem' });
  assert.equal(calls.length, 2);
});

test('DELETE confirms whether or not the caller echoes a text', async () => {
  const { port, calls } = recordingPort();
  const first = await prepare(port, { itemId: ITEM, action: 'DELETE' }, WS);
  await confirm(port, { confirmToken: first.confirmToken, itemId: ITEM, action: 'DELETE', text: 'echoed' }, WS);
  const second = await prepare(port, { itemId: ITEM, action: 'DELETE', text: 'ignored' }, WS);
  await confirm(port, { confirmToken: second.confirmToken, itemId: ITEM, action: 'DELETE' }, WS);
  assert.deepEqual(
    calls.map((c) => c.args[0]),
    [{ itemId: ITEM, action: 'DELETE' }, { itemId: ITEM, action: 'DELETE' }],
  );
});

const POST = { posts: [{ content: 'connector check', socialMediaId: ITEM }], status: 'DRAFT' };

test('the remote binding is always gated: create_posts is held, set_inbox_item_state has no DELETE', () => {
  for (const tools of [gatedTools(recordingPort().port), remoteWithoutSecret(recordingPort().port)]) {
    const create = tool(tools, 'create_posts');
    assert.equal(parse(create, { ...POST, approvalStatus: 'APPROVED' }).success, false);
    assert.equal(parse(create, POST).data.approvalStatus, 'PENDING_APPROVAL');
    assert.equal(create.annotations.destructiveHint, false);
    const moderate = tool(tools, 'set_inbox_item_state');
    assert.equal(parse(moderate, { itemId: ITEM, action: 'DELETE' }).success, false);
    assert.equal(parse(moderate, { itemId: ITEM, action: 'HIDE' }).success, true);
    const names = tools.map((t) => t.name);
    assert.ok(!names.includes('reply_to_inbox_item') && !names.includes('send_inbox_private_reply'));
    assert.match(tool(tools, 'approve_posts').description, /only after they say yes/);
  }
  const names = gatedTools(recordingPort().port).map((t) => t.name);
  assert.equal(names.length, 27);
  // Later tools append: the confirm tools keep their published positions.
  assert.deepEqual(names.slice(24), ['prepare_inbox_action', 'confirm_inbox_action', 'delete_posts']);
});

test('without a secret the remote binding stays gated and leaves out only the two confirm tools', () => {
  const view = (tools) => tools.map((t) => [t.name, t.description, t.annotations, Object.keys(t.inputSchema)]);
  const withSecret = gatedTools(recordingPort().port);
  const without = remoteWithoutSecret(recordingPort().port);
  assert.deepEqual(
    view(without),
    view(withSecret.filter((t) => !t.name.endsWith('_inbox_action'))),
  );
});

test('stdio keeps direct publishing and direct replies', async () => {
  const { port, calls } = recordingPort();
  const tools = stdioTools(port);
  const create = tool(tools, 'create_posts');
  assert.equal(parse(create, { ...POST, approvalStatus: 'APPROVED' }).success, true);
  await create.run(port, parse(create, POST).data);
  assert.equal(calls[0].method, 'createPosts');
  assert.equal(calls[0].args[0].approvalStatus, 'APPROVED');
  calls.length = 0;
  await tool(tools, 'reply_to_inbox_item').run(port, { itemId: ITEM, text: 'thanks!' });
  assert.deepEqual(calls, [{ method: 'replyToInboxItem', args: [{ itemId: ITEM, text: 'thanks!' }, undefined] }]);
  calls.length = 0;
  const moderate = tool(tools, 'set_inbox_item_state');
  assert.equal(parse(moderate, { itemId: ITEM, action: 'DELETE' }).success, true);
  await moderate.run(port, { itemId: ITEM, action: 'DELETE' });
  assert.deepEqual(calls, [{ method: 'setInboxItemState', args: [{ itemId: ITEM, action: 'DELETE' }, undefined] }]);
  assert.ok(!tools.some((t) => t.name.endsWith('_inbox_action') || t.name === 'approve_posts'));
});

test('a short secret throws on remote; stdio ignores the gate', () => {
  assert.throws(
    () => buildTools({ binding: 'remote', confirmGate: { secret: 'short' } }),
    /confirmGate\.secret must be at least 32 characters/,
  );
  const view = (tools) => tools.map((t) => [t.name, t.description, t.annotations, t._meta, t.run]);
  const plain = buildTools({ binding: 'stdio' });
  const withGate = buildTools({ binding: 'stdio', confirmGate: { secret: 'short' } });
  assert.equal(withGate.length, 25);
  assert.deepEqual(view(withGate), view(plain));
});

test('instructions: remote holds everything for a yes, stdio keeps its own text', () => {
  assert.equal(instructionsFor('remote'), SERVER_INSTRUCTIONS.remote);
  assert.equal(instructionsFor('remote', { gated: true }), SERVER_INSTRUCTIONS.remote);
  assert.equal(instructionsFor('stdio', { gated: true }), SERVER_INSTRUCTIONS.stdio);
  const stdio = SERVER_INSTRUCTIONS.stdio.split('\n\n');
  const remote = SERVER_INSTRUCTIONS.remote.split('\n\n');
  assert.equal(remote.length, stdio.length);
  const differs = stdio.filter((p, i) => p !== remote[i]).map((p) => p.slice(0, 12));
  assert.deepEqual(differs, ['Flow: list_a', 'The POSTFAST', 'Status & tim', 'delete_post ', 'Social inbox']);
  for (const s of ['ChatGPT', 'few minutes ahead', 'reply_to_inbox_item', 'send_inbox_private_reply']) {
    assert.ok(!SERVER_INSTRUCTIONS.remote.includes(s), s);
  }
  for (const s of [
    'approve_posts only after they say yes',
    'confirm_inbox_action only after they say yes',
    'call delete_post or delete_posts only after they say yes',
  ]) {
    assert.ok(SERVER_INSTRUCTIONS.remote.includes(s), s);
  }
});

// The remote surface tells the model to wait for the user before anything is
// published, sent, hidden or removed; stdio keeps its own wording.
const CONSENT = {
  approve_posts: [
    /call this only after they say yes in the conversation/,
    /don't approve it\. Tell the user, and only if they agree, create it again/,
  ],
  delete_post: [/call this only after they say yes in the conversation/],
  delete_posts: [/show the user every post you are about to delete .* call this only after they say yes in the conversation/],
  prepare_inbox_action: [/wait for their yes in the conversation before calling confirm_inbox_action/],
  confirm_inbox_action: [/only after the user has seen the preview and said yes in the conversation/],
  generate_connect_link: [/Email the link \(sendEmail\) only when the user asks you to and gives the address/],
  set_inbox_item_state: [/Hide or unhide a comment only when the user asks/],
};

test('remote tool text waits for the user before anything is published, sent, hidden or removed', () => {
  const tools = gatedTools(recordingPort().port);
  for (const [name, patterns] of Object.entries(CONSENT)) {
    for (const pattern of patterns) assert.match(tool(tools, name).description, pattern, name);
  }
  assert.match(
    tool(tools, 'generate_connect_link').inputSchema.sendEmail.description,
    /only when the user asks you to and gives the address/,
  );
  assert.doesNotMatch(tool(tools, 'approve_posts').description, /instead of approving it, and delete the old one/);
  assert.doesNotMatch(tool(tools, 'delete_post').description, /The deletion cannot be undone/);
  assert.doesNotMatch(tool(tools, 'delete_posts').description, /The deletion cannot be undone/);
});

test('stdio keeps its own wording for the tools whose remote text asks for the yes', () => {
  const tools = stdioTools(recordingPort().port);
  assert.match(tool(tools, 'delete_post').description, /does prevent it from publishing\. The deletion cannot be undone\.$/);
  assert.match(tool(tools, 'delete_posts').description, /listed once each\. The deletion cannot be undone\.$/);
  assert.equal(tool(tools, 'generate_connect_link').inputSchema.sendEmail.description, 'Send the link via email');
  for (const name of ['delete_post', 'delete_posts', 'generate_connect_link', 'set_inbox_item_state']) {
    for (const phrase of ['say yes', 'only when the user asks']) {
      assert.ok(!tool(tools, name).description.includes(phrase), `${name}: ${phrase}`);
    }
  }
  const stdioDelete = SERVER_INSTRUCTIONS.stdio.split('\n\n').find((p) => p.startsWith('delete_post '));
  assert.ok(stdioDelete.includes('delete_posts') && !stdioDelete.includes('say yes'), stdioDelete);
});
