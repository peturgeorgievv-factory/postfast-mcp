// The remote binding's confirmation rules, exercised against the built dist:
// posts are held until approve_posts, and each comment reply, private reply
// and deletion is previewed by one tool and carried out by another, with the
// preview's signed token (BuildToolsOptions.confirmGate). The stdio binding
// keeps direct publishing and replies. Run with `npm test`.
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

/** A port that records every call and answers with a marker result. */
function recordingPort({ delayMs = 0, fail, without = [] } = {}) {
  const calls = [];
  const port = new Proxy(
    {},
    {
      get: (_t, method) =>
        method === 'then' || without.includes(method)
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
const run = (port, name, args, ws) => tool(gatedTools(port), name).run(port, args, ws);
const parse = (t, args) => z.object(t.inputSchema).safeParse(args);

/** The token's jti, which the reply tools send as the backend's idempotency key. */
const jtiOf = (confirmToken) => confirmToken.split('.')[2];

/**
 * Each comment operation: its preview tool, the tool that carries it out, and
 * the port call it makes for a given token.
 */
const OPERATIONS = [
  {
    action: 'REPLY',
    preview: 'preview_comment_reply',
    perform: 'reply_to_comment',
    args: { itemId: ITEM, text: 'thanks!' },
    method: 'replyToInboxItem',
    call: (token) => ({
      method: 'replyToInboxItem',
      args: [{ itemId: ITEM, text: 'thanks!', idempotencyKey: `confirm:${jtiOf(token)}` }, WS],
    }),
  },
  {
    action: 'PRIVATE_REPLY',
    preview: 'preview_private_reply',
    perform: 'send_private_reply',
    args: { itemId: ITEM, text: 'thanks!' },
    method: 'sendInboxPrivateReply',
    call: (token) => ({
      method: 'sendInboxPrivateReply',
      args: [{ itemId: ITEM, text: 'thanks!', idempotencyKey: `confirm:${jtiOf(token)}` }, WS],
    }),
  },
  {
    action: 'DELETE',
    preview: 'preview_comment_deletion',
    perform: 'delete_comment',
    args: { itemId: ITEM },
    method: 'setInboxItemState',
    // Deleting twice can't remove more, so a deletion sends no idempotency key.
    call: () => ({ method: 'setInboxItemState', args: [{ itemId: ITEM, action: 'DELETE' }, WS] }),
  },
];
const [REPLY] = OPERATIONS;
const COMMENT_TOOLS = OPERATIONS.flatMap((op) => [op.preview, op.perform]);

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mismatch = (op) =>
  new RegExp(
    `^Error: ${escape(`confirmToken does not match this request. Preview it again with ${op.preview} and pass exactly what was previewed.`)}$`,
  );

for (const op of OPERATIONS) {
  test(`${op.preview} returns a preview and a token and calls no port method`, async () => {
    const { port, calls } = recordingPort();
    const out = await run(port, op.preview, op.args, WS);
    assert.deepEqual(out.preview, { action: op.action, ...op.args, workspaceId: WS });
    assert.match(out.confirmToken, /^v1\.\d{10}\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    assert.ok(Date.parse(out.expiresAt) > Date.now());
    assert.match(out.next, new RegExp(`call ${op.perform} with this confirmToken`));
    // No workspaceId passed means no workspaceId key.
    const plain = await run(port, op.preview, op.args, undefined);
    assert.deepEqual(plain.preview, { action: op.action, ...op.args });
    assert.equal(calls.length, 0);
  });

  test(`${op.perform} calls ${op.method} exactly once with the exact args`, async () => {
    const { port, calls } = recordingPort();
    const { confirmToken } = await run(port, op.preview, op.args, WS);
    const result = await run(port, op.perform, { confirmToken, ...op.args }, WS);
    assert.deepEqual(calls, [op.call(confirmToken)]);
    assert.deepEqual(result, { ok: true, method: op.method });
  });

  test(`${op.perform} refuses a missing token, another operation's token and a changed request`, async () => {
    const { port, calls } = recordingPort();
    const { confirmToken } = await run(port, op.preview, op.args, WS);
    await assert.rejects(
      run(port, op.perform, { ...op.args }, WS),
      new RegExp(`^Error: confirmToken is required\\. Preview it first with ${op.preview}\\.$`),
    );
    // A token another operation previewed for the same comment carries nothing out here.
    for (const other of OPERATIONS.filter((o) => o !== op)) {
      const foreign = await run(port, other.preview, { ...other.args }, WS);
      await assert.rejects(
        run(port, op.perform, { ...op.args, confirmToken: foreign.confirmToken }, WS),
        mismatch(op),
      );
    }
    const changed = [
      [{ ...op.args, itemId: OTHER_ITEM }, WS],
      [op.args, OTHER_WS],
      [op.args, undefined],
      ...('text' in op.args ? [[{ ...op.args, text: 'thanks' }, WS]] : []),
    ];
    for (const [args, ws] of changed) {
      await assert.rejects(run(port, op.perform, { confirmToken, ...args }, ws), mismatch(op));
    }
    assert.equal(calls.length, 0);
    // A refused attempt does not use the token up.
    await run(port, op.perform, { confirmToken, ...op.args }, WS);
    assert.deepEqual(calls, [op.call(confirmToken)]);
  });

  test(`${op.perform} refuses an expired token and a reused one`, async () => {
    const { port, calls } = recordingPort();
    const fields = { ws: WS, action: op.action, ...op.args };
    const stale = sign(fields, SECRET, Date.now() - 901_000).confirmToken;
    await assert.rejects(
      run(port, op.perform, { confirmToken: stale, ...op.args }, WS),
      new RegExp(`^Error: confirmToken has expired\\. Preview it again with ${op.preview}\\.$`),
    );
    const { confirmToken } = await run(port, op.preview, op.args, WS);
    await run(port, op.perform, { confirmToken, ...op.args }, WS);
    await assert.rejects(
      run(port, op.perform, { confirmToken, ...op.args }, WS),
      /^Error: This confirmToken was already used\.$/,
    );
    assert.equal(calls.length, 1);
  });
}

test('the reply previews refuse a missing text', async () => {
  const { port } = recordingPort();
  for (const name of ['preview_comment_reply', 'preview_private_reply']) {
    await assert.rejects(run(port, name, { itemId: ITEM }, WS), /^Error: text is required\.$/);
  }
});

test('a tampered signature, another secret and malformed tokens are refused', async () => {
  const { port, calls } = recordingPort();
  const { confirmToken } = await run(port, REPLY.preview, REPLY.args, WS);
  const tampered = confirmToken.slice(0, -1) + (confirmToken.endsWith('A') ? 'B' : 'A');
  const foreign = sign({ ws: WS, action: 'REPLY', ...REPLY.args }, 'a-different-secret-also-32-chars').confirmToken;
  for (const bad of [tampered, foreign, 'v1', `v2${confirmToken.slice(2)}`, `${confirmToken}.x`]) {
    await assert.rejects(run(port, REPLY.perform, { confirmToken: bad, ...REPLY.args }, WS), mismatch(REPLY));
  }
  assert.equal(calls.length, 0);
});

test('expiry is in seconds: a token verifies at +899 s and is expired at +901 s', () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0, 500);
  const fields = { ws: WS, itemId: ITEM, action: 'DELETE' };
  const signed = sign(fields, SECRET, now);
  assert.equal(signed.expiresAt, '2026-09-24T12:15:00.000Z');
  assert.doesNotThrow(() => redeem(signed.confirmToken, fields, SECRET, now + 899_000));
  assert.throws(() => redeem(sign(fields, SECRET, now).confirmToken, fields, SECRET, now + 901_000), /expired/);
});

test('two concurrent calls with the same token make exactly one port call', async () => {
  const { port, calls } = recordingPort({ delayMs: 20 });
  const { confirmToken } = await run(port, REPLY.preview, REPLY.args, WS);
  const results = await Promise.allSettled([
    run(port, REPLY.perform, { confirmToken, ...REPLY.args }, WS),
    run(port, REPLY.perform, { confirmToken, ...REPLY.args }, WS),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.match(results.find((r) => r.status === 'rejected').reason.message, /already used/);
  assert.equal(calls.length, 1);
});

test('a failed platform call releases the token so the same call can retry', async () => {
  let failing = true;
  const { port, calls } = recordingPort({ fail: () => failing });
  const { confirmToken } = await run(port, REPLY.preview, REPLY.args, WS);
  await assert.rejects(run(port, REPLY.perform, { confirmToken, ...REPLY.args }, WS), /inbox\.rateLimited/);
  failing = false;
  assert.deepEqual(await run(port, REPLY.perform, { confirmToken, ...REPLY.args }, WS), {
    ok: true,
    method: 'replyToInboxItem',
  });
  // Both attempts carry the same key, so if the first one did go out, the backend sends it once.
  assert.deepEqual(calls, [REPLY.call(confirmToken), REPLY.call(confirmToken)]);
});

test('each approval sends under its own idempotency key, the token\'s id', async () => {
  const { port, calls } = recordingPort();
  for (const op of OPERATIONS.filter((o) => o.action !== 'DELETE')) {
    const first = await run(port, op.preview, op.args, WS);
    const second = await run(port, op.preview, op.args, WS);
    await run(port, op.perform, { ...op.args, confirmToken: first.confirmToken }, WS);
    await run(port, op.perform, { ...op.args, confirmToken: second.confirmToken }, WS);
    const keys = calls.splice(0).map((c) => c.args[0].idempotencyKey);
    assert.deepEqual(keys, [`confirm:${jtiOf(first.confirmToken)}`, `confirm:${jtiOf(second.confirmToken)}`]);
    // Two previews the user said yes to are two sends, not one.
    assert.notEqual(keys[0], keys[1]);
    // The backend takes keys up to 200 characters.
    assert.ok(keys.every((key) => key.length <= 200));
  }
});

test('one tool per operation: each comment tool takes only its own fields and carries its own hints', () => {
  const tools = gatedTools(recordingPort().port);
  const keys = (name) => Object.keys(tool(tools, name).inputSchema).sort();
  assert.deepEqual(keys('preview_comment_reply'), ['itemId', 'text', 'workspaceId']);
  assert.deepEqual(keys('reply_to_comment'), ['confirmToken', 'itemId', 'text', 'workspaceId']);
  assert.deepEqual(keys('preview_private_reply'), ['itemId', 'text', 'workspaceId']);
  assert.deepEqual(keys('send_private_reply'), ['confirmToken', 'itemId', 'text', 'workspaceId']);
  assert.deepEqual(keys('preview_comment_deletion'), ['itemId', 'workspaceId']);
  assert.deepEqual(keys('delete_comment'), ['confirmToken', 'itemId', 'workspaceId']);

  const hints = (name) => {
    const { title: _title, ...rest } = tool(tools, name).annotations;
    return rest;
  };
  const preview = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const reply = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  for (const op of OPERATIONS) assert.deepEqual(hints(op.preview), preview, op.preview);
  assert.deepEqual(hints('reply_to_comment'), reply);
  assert.deepEqual(hints('send_private_reply'), reply);
  assert.deepEqual(hints('delete_comment'), {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  });

  // The token is required: a call without one never reaches run().
  for (const op of OPERATIONS) {
    assert.equal(parse(tool(tools, op.perform), op.args).success, false, op.perform);
    assert.equal(parse(tool(tools, op.perform), { ...op.args, confirmToken: 'x' }).success, true, op.perform);
  }
});

test('no hosted tool switches between operations with a parameter', () => {
  const app = { mediaOrigin: 'https://media.example.com', domain: 'https://mcp.example.com', webAppUrl: 'https://app.example.com' };
  const tools = buildTools({ binding: 'remote', withWorkspaceField: true, confirmGate: { secret: SECRET }, app });
  const enumValues = (schema) => {
    const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
    return json.enum ?? json.anyOf?.flatMap((s) => s.enum ?? []) ?? [];
  };
  for (const t of tools) {
    for (const [field, schema] of Object.entries(t.inputSchema)) {
      // No field picks a comment operation: those are tools of their own.
      for (const value of ['REPLY', 'PRIVATE_REPLY', 'DELETE']) {
        assert.ok(!enumValues(schema).includes(value), `${t.name}.${field} offers ${value}`);
      }
      if (field === 'action' || field === 'operation') {
        // set_inbox_item_state sets a comment's visibility, hidden or shown,
        // reversibly and under one set of hints; record_app_action only records
        // which calendar button was used, and the model never sees it.
        assert.ok(['set_inbox_item_state', 'record_app_action'].includes(t.name), `${t.name} has ${field}`);
      }
    }
  }
  assert.deepEqual(enumValues(tool(tools, 'set_inbox_item_state').inputSchema.action), ['HIDE', 'UNHIDE']);
  // Negative control: the check sees an operation enum when there is one.
  assert.ok(enumValues(z.enum(['REPLY', 'PRIVATE_REPLY', 'DELETE'])).includes('DELETE'));
  for (const surface of [tools, stdioTools(recordingPort().port)]) {
    const names = surface.map((t) => t.name);
    assert.ok(!names.includes('prepare_inbox_action') && !names.includes('confirm_inbox_action'));
  }
});

test('a port without one inbox method leaves out only that operation\'s two tools', () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  let tools;
  try {
    tools = gatedTools(recordingPort({ without: ['sendInboxPrivateReply'] }).port);
  } finally {
    console.error = original;
  }
  const names = tools.map((t) => t.name);
  assert.ok(!names.includes('preview_private_reply') && !names.includes('send_private_reply'));
  for (const name of ['preview_comment_reply', 'reply_to_comment', 'preview_comment_deletion', 'delete_comment']) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(logged.filter((line) => line.includes('sendInboxPrivateReply')).length, 2);
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
  assert.equal(names.length, 31);
  // The comment tools take the place of the pair they replace; delete_posts stays last.
  assert.deepEqual(names.slice(24), [...COMMENT_TOOLS, 'delete_posts']);
});

test('without a secret the remote binding stays gated and leaves out only the six comment tools', () => {
  const view = (tools) => tools.map((t) => [t.name, t.description, t.annotations, Object.keys(t.inputSchema)]);
  const withSecret = gatedTools(recordingPort().port);
  const without = remoteWithoutSecret(recordingPort().port);
  assert.deepEqual(
    view(without),
    view(withSecret.filter((t) => !COMMENT_TOOLS.includes(t.name))),
  );
  assert.equal(withSecret.length - without.length, 6);
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
  assert.ok(!tools.some((t) => COMMENT_TOOLS.includes(t.name) || t.name === 'approve_posts'));
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
  for (const s of [
    'ChatGPT',
    'few minutes ahead',
    'reply_to_inbox_item',
    'send_inbox_private_reply',
    'prepare_inbox_action',
    'confirm_inbox_action',
  ]) {
    assert.ok(!SERVER_INSTRUCTIONS.remote.includes(s), s);
  }
  for (const s of [
    'approve_posts only after they say yes',
    'preview it with preview_comment_reply, preview_private_reply or preview_comment_deletion, show the user the preview',
    'carry it out with reply_to_comment, send_private_reply or delete_comment only after they say yes',
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
  preview_comment_reply: [/wait for their yes in the conversation before calling reply_to_comment, even if they already told you what to write/],
  reply_to_comment: [/only after the user has seen the preview and said yes in the conversation/],
  preview_private_reply: [/wait for their yes in the conversation before calling send_private_reply, even if they already told you what to write/],
  send_private_reply: [/only after the user has seen the preview and said yes in the conversation/],
  preview_comment_deletion: [/wait for their yes in the conversation before calling delete_comment/],
  delete_comment: [/only after the user has seen the preview and said yes in the conversation/],
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

test('the comment tools keep their irreversibility notes', () => {
  const tools = gatedTools(recordingPort().port);
  assert.match(tool(tools, 'reply_to_comment').description, /Replies on Threads can't be removed through PostFast\./);
  assert.match(tool(tools, 'preview_comment_reply').description, /A reply on Threads can't be removed through PostFast afterwards/);
  assert.match(tool(tools, 'send_private_reply').description, /A private reply can't be unsent/);
  assert.match(tool(tools, 'delete_comment').description, /Deleting can't be undone\./);
  assert.match(tool(tools, 'preview_comment_deletion').description, /will be deleted permanently/);
  // The moderation and item tools point at the comment tools that replaced the old pair.
  assert.match(tool(tools, 'set_inbox_item_state').description, /use preview_comment_deletion, then delete_comment/);
  assert.match(tool(tools, 'list_inbox_items').description, /through preview_private_reply and send_private_reply/);
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
