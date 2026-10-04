// list_posts' account filter and the bulk delete_posts tool on both bindings,
// exercised against the built dist. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildTools } from '../dist/core/index.js';

const WS = '33333333-3333-4333-8333-333333333333';
const uuids = (n) =>
  Array.from({ length: n }, (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`);
const [A, B] = uuids(2);

/** A port that records every call; `without` lists methods it does not implement. */
function recordingPort(without = []) {
  const calls = [];
  const port = new Proxy(
    {},
    {
      get: (_t, method) =>
        method === 'then' || without.includes(method)
          ? undefined
          : async (...args) => {
              calls.push({ method, args });
              return { ok: true };
            },
    },
  );
  return { port, calls };
}

const SURFACES = {
  stdio: (port) => buildTools({ binding: 'stdio', port }),
  remote: (port) =>
    buildTools({
      binding: 'remote',
      withWorkspaceField: true,
      port,
      confirmGate: { secret: 'posts-test-secret-of-32-chars-ok' },
    }),
};
const tool = (tools, name) => tools.find((t) => t.name === name);
const parse = (t, args) => z.object(t.inputSchema).safeParse(args);
const hints = ({ title: _title, ...rest }) => rest;

for (const [binding, build] of Object.entries(SURFACES)) {
  const ws = binding === 'remote' ? WS : undefined;

  test(`${binding}: list_posts takes up to 100 account ids and forwards them`, async () => {
    const { port, calls } = recordingPort();
    const list = tool(build(port), 'list_posts');
    assert.match(list.description, /filters for specific IDs, accounts, platform, status, and date range/);
    for (const bad of [uuids(101), ['not-a-uuid'], A]) {
      assert.equal(parse(list, { socialMediaIds: bad }).success, false);
    }
    assert.equal(parse(list, { socialMediaIds: uuids(100) }).success, true);
    // Absent stays absent: a call without the filter sends no socialMediaIds key.
    assert.ok(!('socialMediaIds' in parse(list, {}).data));

    const { workspaceId, ...args } = parse(list, {
      socialMediaIds: [A, B],
      statuses: ['SCHEDULED'],
      ...(ws ? { workspaceId: ws } : {}),
    }).data;
    await list.run(port, args, workspaceId);
    assert.deepEqual(calls, [
      {
        method: 'listPosts',
        args: [{ page: 0, limit: 20, socialMediaIds: [A, B], statuses: ['SCHEDULED'] }, ws],
      },
    ]);
  });

  test(`${binding}: delete_posts sends 1 to 100 post ids to deletePosts`, async () => {
    const { port, calls } = recordingPort();
    const tools = build(port);
    const del = tool(tools, 'delete_posts');
    for (const bad of [[], uuids(101), [A, 'not-a-uuid'], A, undefined]) {
      assert.equal(parse(del, { ids: bad }).success, false);
    }
    assert.equal(parse(del, { ids: uuids(100) }).success, true);
    assert.deepEqual(await del.run(port, { ids: [A, B] }, ws), { ok: true });
    assert.deepEqual(calls, [{ method: 'deletePosts', args: [[A, B], ws] }]);

    assert.equal(del.title, 'Delete Posts');
    assert.deepEqual(hints(del.annotations), hints(tool(tools, 'delete_post').annotations));
    assert.match(del.description, /It does NOT delete anything from the social platform/);
    assert.match(del.description, /Returns \{ deletedIds, notFoundIds \}/);
    assert.match(del.description, /use delete_post for a single post/);
  });

  test(`${binding}: delete_posts is appended, so every existing tool keeps its position`, () => {
    const names = build(recordingPort().port).map((t) => t.name);
    assert.equal(names.at(-1), 'delete_posts');
    assert.equal(names.indexOf('delete_posts'), names.length - 1);
  });

  test(`${binding}: a port without deletePosts skips delete_posts and nothing else`, () => {
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args.join(' '));
    let full;
    let older;
    try {
      full = build(recordingPort().port);
      older = build(recordingPort(['deletePosts']).port);
    } finally {
      console.error = original;
    }
    const view = (tools) => tools.map((t) => [t.name, t.description, t.annotations, Object.keys(t.inputSchema)]);
    assert.deepEqual(view(older), view(full.filter((t) => t.name !== 'delete_posts')));
    assert.deepEqual(logged, [
      '[postfast-mcp/core] skipping tool "delete_posts": the backend port does not implement deletePosts() yet (older adapter, newer catalog)',
    ]);
  });
}
