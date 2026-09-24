// Confirm gate (BuildToolsOptions.confirmGate), exercised against the built
// dist. Run with `npm test`.
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
const ungatedTools = (port) => buildTools({ binding: 'remote', withWorkspaceField: true, port });
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

test('gated schemas: create_posts is always held, set_inbox_item_state has no DELETE', () => {
  const tools = gatedTools(recordingPort().port);
  const create = tool(tools, 'create_posts');
  assert.equal(parse(create, { ...POST, approvalStatus: 'APPROVED' }).success, false);
  assert.equal(parse(create, POST).data.approvalStatus, 'PENDING_APPROVAL');
  const moderate = tool(tools, 'set_inbox_item_state');
  assert.equal(parse(moderate, { itemId: ITEM, action: 'DELETE' }).success, false);
  assert.equal(parse(moderate, { itemId: ITEM, action: 'HIDE' }).success, true);
  const names = tools.map((t) => t.name);
  assert.equal(names.length, 26);
  assert.deepEqual(names.slice(-2), ['prepare_inbox_action', 'confirm_inbox_action']);
  assert.ok(!names.includes('reply_to_inbox_item') && !names.includes('send_inbox_private_reply'));
});

test('ungated behaves like 0.6.2 on the calls that matter', async () => {
  const { port, calls } = recordingPort();
  const tools = ungatedTools(port);
  const create = tool(tools, 'create_posts');
  assert.equal(parse(create, { ...POST, approvalStatus: 'APPROVED' }).success, true);
  await create.run(port, parse(create, POST).data, WS);
  assert.equal(calls[0].method, 'createPosts');
  assert.equal(calls[0].args[0].approvalStatus, 'APPROVED');
  calls.length = 0;
  await tool(tools, 'reply_to_inbox_item').run(port, { itemId: ITEM, text: 'thanks!' }, WS);
  assert.deepEqual(calls, [{ method: 'replyToInboxItem', args: [{ itemId: ITEM, text: 'thanks!' }, WS] }]);
  calls.length = 0;
  const moderate = tool(tools, 'set_inbox_item_state');
  assert.equal(parse(moderate, { itemId: ITEM, action: 'DELETE' }).success, true);
  await moderate.run(port, { itemId: ITEM, action: 'DELETE' }, WS);
  assert.deepEqual(calls, [{ method: 'setInboxItemState', args: [{ itemId: ITEM, action: 'DELETE' }, WS] }]);
  assert.ok(!tools.some((t) => t.name.endsWith('_inbox_action')));
});

test('a short secret throws on remote; stdio ignores the gate', () => {
  assert.throws(
    () => buildTools({ binding: 'remote', confirmGate: { secret: 'short' } }),
    /confirmGate\.secret must be at least 32 characters/,
  );
  const view = (tools) => tools.map((t) => [t.name, t.description, t.annotations, t._meta, t.run]);
  const plain = buildTools({ binding: 'stdio' });
  const withGate = buildTools({ binding: 'stdio', confirmGate: { secret: 'short' } });
  assert.equal(withGate.length, 24);
  assert.deepEqual(view(withGate), view(plain));
});

test('instructions: the gated text swaps exactly three paragraphs', () => {
  assert.equal(instructionsFor('remote'), SERVER_INSTRUCTIONS.remote);
  assert.equal(instructionsFor('stdio', { gated: true }), SERVER_INSTRUCTIONS.stdio);
  const plain = SERVER_INSTRUCTIONS.remote.split('\n\n');
  const gated = instructionsFor('remote', { gated: true }).split('\n\n');
  assert.equal(gated.length, plain.length);
  const swapped = plain.filter((p, i) => p !== gated[i]).map((p) => p.slice(0, 12));
  assert.deepEqual(swapped, ['Flow: list_a', 'Status & tim', 'Social inbox']);
  for (const s of ['ChatGPT', 'few minutes ahead', 'reply_to_inbox_item', 'send_inbox_private_reply']) {
    assert.ok(!gated.join('\n\n').includes(s), s);
  }
});
