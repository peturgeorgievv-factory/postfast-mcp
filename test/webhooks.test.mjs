// The webhook endpoint tools on both bindings, exercised against the built
// dist: what each tool hands the port, the backend's limits in the schemas,
// and the delivery rules each description has to carry, since a model learns
// them nowhere else. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ALL_TOOLS, WEBHOOK_EVENTS, buildTools } from '../dist/core/index.js';

const WS = '33333333-3333-4333-8333-333333333333';
const ID = '11111111-1111-4111-8111-111111111111';
const URL_OK = 'https://hooks.example.com/postfast';

/** The tools in registration order, with the port method each one calls. */
const WEBHOOK_TOOLS = {
  list_webhook_endpoints: 'listWebhookEndpoints',
  get_webhook_endpoint: 'getWebhookEndpoint',
  create_webhook_endpoint: 'createWebhookEndpoint',
  update_webhook_endpoint: 'updateWebhookEndpoint',
  delete_webhook_endpoint: 'deleteWebhookEndpoint',
  test_webhook_endpoint: 'testWebhookEndpoint',
  list_webhook_deliveries: 'listWebhookDeliveries',
};
const NAMES = Object.keys(WEBHOOK_TOOLS);

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
      confirmGate: { secret: 'webhooks-test-secret-of-32-chars' },
    }),
};
const tool = (tools, name) => tools.find((t) => t.name === name);
const parse = (t, args) => z.object(t.inputSchema).safeParse(args);
const hints = ({ title: _title, ...rest }) => rest;
const fieldText = (t, field) => t.inputSchema[field].description;

/** Every description in a tool: its own and its fields', as clients receive them. */
function texts(t) {
  const json = z.toJSONSchema(z.object(t.inputSchema), { io: 'input', unrepresentable: 'any' });
  const found = [t.description];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      if (typeof node.description === 'string') found.push(node.description);
      Object.values(node).forEach(walk);
    }
  };
  walk(json);
  return found;
}

test('WEBHOOK_EVENTS are the four event types an endpoint can receive', () => {
  assert.deepEqual(WEBHOOK_EVENTS, ['post.published', 'post.failed', 'account.connected', 'account.disconnected']);
});

for (const [binding, build] of Object.entries(SURFACES)) {
  const ws = binding === 'remote' ? WS : undefined;
  const withWs = (args) => (ws ? { ...args, workspaceId: ws } : args);

  test(`${binding}: the seven webhook tools come right after delete_posts`, () => {
    const names = build(recordingPort().port).map((t) => t.name);
    assert.equal(names.length, binding === 'stdio' ? 32 : 38);
    assert.deepEqual(names.slice(names.indexOf('delete_posts') + 1), NAMES);
  });

  test(`${binding}: each tool hands its port method exactly the parsed arguments`, async () => {
    const cases = [
      ['list_webhook_endpoints', {}, [ws]],
      ['get_webhook_endpoint', { id: ID }, [ID, ws]],
      ['create_webhook_endpoint', { url: URL_OK, events: ['post.published'] }, [{ url: URL_OK, events: ['post.published'] }, ws]],
      [
        'create_webhook_endpoint',
        { url: URL_OK, events: ['post.failed', 'account.disconnected'], description: 'Ops alerts' },
        [{ url: URL_OK, events: ['post.failed', 'account.disconnected'], description: 'Ops alerts' }, ws],
      ],
      // Absent stays absent (keep), and null stays null (remove the description).
      ['update_webhook_endpoint', { id: ID, description: null, active: true }, [{ id: ID, description: null, active: true }, ws]],
      ['update_webhook_endpoint', { id: ID, url: URL_OK, events: ['account.connected'] }, [{ id: ID, url: URL_OK, events: ['account.connected'] }, ws]],
      ['delete_webhook_endpoint', { id: ID }, [ID, ws]],
      ['test_webhook_endpoint', { id: ID }, [{ id: ID }, ws]],
      ['test_webhook_endpoint', { id: ID, sampleEvent: 'post.published' }, [{ id: ID, sampleEvent: 'post.published' }, ws]],
      // The defaults fill page and limit; getCount goes only when given.
      ['list_webhook_deliveries', { endpointId: ID }, [{ endpointId: ID, page: 0, limit: 10 }, ws]],
      [
        'list_webhook_deliveries',
        { endpointId: ID, page: 2, limit: 100, getCount: true },
        [{ endpointId: ID, page: 2, limit: 100, getCount: true }, ws],
      ],
    ];
    for (const [name, input, args] of cases) {
      const { port, calls } = recordingPort();
      const t = tool(build(port), name);
      const parsed = parse(t, withWs(input));
      assert.ok(parsed.success, `${name}: ${parsed.error}`);
      const { workspaceId, ...rest } = parsed.data;
      assert.deepEqual(await t.run(port, rest, workspaceId), { ok: true }, name);
      assert.deepEqual(calls, [{ method: WEBHOOK_TOOLS[name], args }], name);
    }
  });

  test(`${binding}: the schemas hold the backend's limits`, () => {
    const tools = build(recordingPort().port);
    const create = tool(tools, 'create_webhook_endpoint');
    const update = tool(tools, 'update_webhook_endpoint');
    const send = tool(tools, 'test_webhook_endpoint');
    const log = tool(tools, 'list_webhook_deliveries');
    const ok = { url: URL_OK, events: ['post.published'] };
    for (const bad of [
      {},
      { url: URL_OK },
      { ...ok, url: 'not a url' },
      { ...ok, url: `https://hooks.example.com/${'x'.repeat(2049 - 'https://hooks.example.com/'.length)}` },
      { ...ok, events: [] },
      { ...ok, events: ['webhook.test'] },
      { ...ok, events: ['post.created'] },
      { ...ok, events: [...WEBHOOK_EVENTS, 'post.published'] },
      { ...ok, description: 'x'.repeat(256) },
      { ...ok, description: null },
    ]) {
      assert.equal(parse(create, bad).success, false, JSON.stringify(bad).slice(0, 80));
    }
    assert.equal(parse(create, { ...ok, url: `https://hooks.example.com/${'x'.repeat(2048 - 'https://hooks.example.com/'.length)}` }).success, true);
    assert.equal(parse(create, { ...ok, events: [...WEBHOOK_EVENTS], description: 'x'.repeat(255) }).success, true);

    assert.equal(parse(update, { id: ID }).success, true);
    for (const bad of [{}, { id: 'not-a-uuid' }, { id: ID, events: [] }, { id: ID, url: 'nope' }, { id: ID, active: 'yes' }]) {
      assert.equal(parse(update, bad).success, false, JSON.stringify(bad));
    }

    for (const event of WEBHOOK_EVENTS) assert.equal(parse(send, { id: ID, sampleEvent: event }).success, true, event);
    assert.equal(parse(send, { id: ID, sampleEvent: 'webhook.test' }).success, false);

    for (const bad of [{}, { endpointId: ID, limit: 0 }, { endpointId: ID, limit: 101 }, { endpointId: ID, page: -1 }]) {
      assert.equal(parse(log, bad).success, false, JSON.stringify(bad));
    }
    assert.equal(parse(log, { endpointId: ID, limit: 100 }).success, true);
  });

  test(`${binding}: the hints say what each tool changes and what it reaches`, () => {
    const tools = build(recordingPort().port);
    const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
    for (const name of ['list_webhook_endpoints', 'get_webhook_endpoint', 'list_webhook_deliveries']) {
      assert.deepEqual(hints(tool(tools, name).annotations), read, name);
    }
    const write = (destructive, idempotent, openWorld) => ({
      readOnlyHint: false,
      destructiveHint: destructive,
      idempotentHint: idempotent,
      openWorldHint: openWorld,
    });
    assert.deepEqual(hints(tool(tools, 'create_webhook_endpoint').annotations), write(false, false, true));
    assert.deepEqual(hints(tool(tools, 'update_webhook_endpoint').annotations), write(true, true, true));
    assert.deepEqual(hints(tool(tools, 'delete_webhook_endpoint').annotations), write(true, true, false));
    assert.deepEqual(hints(tool(tools, 'test_webhook_endpoint').annotations), write(false, false, true));
    for (const name of NAMES) assert.equal(tool(tools, name).annotations.title, tool(tools, name).title, name);
  });

  test(`${binding}: the descriptions carry the delivery rules a model can't learn elsewhere`, () => {
    const tools = build(recordingPort().port);
    const create = tool(tools, 'create_webhook_endpoint');
    const FACTS = {
      create_webhook_endpoint: [
        // The secret: once, stored now, and how a receiver uses it.
        /secret \(whsec_…\), shown this once: PostFast never returns it again/,
        /tell them to store it in their receiver now/,
        /delete the endpoint and create a new one/,
        /Standard Webhooks specifies: the webhook-id, webhook-timestamp and webhook-signature headers, verified over the raw request body/,
        // Every event of the workspace, and how to narrow it down.
        /from the whole workspace, for every account/,
        /data\.post\.socialMediaId \(or data\.post\.platform\) or data\.account\.id/,
        /5 active endpoints \(turned-off ones don't count\); one more fails with webhook\.limitReached/,
        // Delivery and what turns an endpoint off.
        /answers 2xx within 15 seconds; redirects are not followed/,
        /retried up to 7 more times over about a day \(after 5 s, 5 min, 30 min, 2 h, 4 h, 6 h and 7 h\)/,
        /A 410 Gone answer turns the endpoint off at once/,
        /five days of failures with no success turn it off and email the workspace owner/,
        /skip an id it has already handled/,
      ],
      update_webhook_endpoint: [
        /Fields you omit keep their value; description null removes the description/,
        /keeps the same signing secret/,
        /disabledReason GONE or FAILING/,
        /webhook\.limitReached when the workspace already has 5 active endpoints/,
        /never sent to it, not even after it is turned back on/,
      ],
      delete_webhook_endpoint: [
        /its delivery log and signing secret are deleted with it/,
        /set active false with update_webhook_endpoint/,
        /webhook\.notFound/,
      ],
      test_webhook_endpoint: [
        /the call succeeds even when the receiver failed, so read delivered, statusCode and error/,
        /Without sampleEvent it sends a webhook\.test event/,
        /ids of zeros, platform X, the post text "Sample post from PostFast" or the account @sample, and no real post or account data/,
        /a 410 Gone answer turns the endpoint off/,
        /webhook\.disabled means PostFast has webhooks switched off for now, not that this endpoint is off/,
      ],
      list_webhook_deliveries: [
        /every delivery to it from the last 30 days/,
        /PENDING \(still being delivered: a nextAttemptAt in the future means a retry is scheduled/,
        /never its response body/,
        /filled only when getCount is true/,
        /gives an empty page rather than an error/,
      ],
      list_webhook_endpoints: [
        /GONE: its receiver answered 410 Gone; FAILING: its deliveries failed for five days and the workspace owner was emailed/,
        /The signing secret is never listed/,
      ],
      get_webhook_endpoint: [/fails with webhook\.notFound/],
    };
    for (const [name, patterns] of Object.entries(FACTS)) {
      for (const pattern of patterns) assert.match(tool(tools, name).description, pattern, name);
    }

    // The URL rules, the limits and every URL error code, on the field they apply to.
    const url = fieldText(create, 'url');
    for (const pattern of [
      /https on port 443/,
      /public hostname that contains a dot \(no IP address, no localhost or internal name, no user:password@\)/,
      /resolves to public addresses/,
      /at most 2,048 characters/,
    ]) {
      assert.match(url, pattern);
    }
    for (const code of ['urlNotHttps', 'urlPortNotAllowed', 'urlHostNotAllowed', 'urlPrivateAddress', 'urlResolutionFailed', 'invalidUrl']) {
      assert.ok(url.includes(`webhook.${code}`), code);
    }
    assert.match(fieldText(create, 'description'), /max 255 characters/);

    // The four event types and what each one means.
    const events = fieldText(create, 'events');
    for (const event of WEBHOOK_EVENTS) assert.ok(events.includes(`${event} (`), event);
    assert.match(events, /post\.failed \(a post failed for good, .*never sent for a failure that will still be retried\)/);
    assert.match(events, /account\.connected \(an account was connected or reconnected; data\.reconnected is true for a reconnect/);
    assert.match(events, /webhook\.test can't be chosen: only test_webhook_endpoint sends it/);
  });

  test(`${binding}: no webhook text pitches a plan or names a client, and every tool it names is on this surface`, () => {
    const tools = build(recordingPort().port);
    const names = new Set(tools.map((t) => t.name));
    const COMMERCE = /\b(?:free trial|trials?|discounts?|promo(?:tion)?s?|coupons?|pricing|prices?|plans?|subscribe[ds]?|subscriptions?|upgrades?|checkout|billing)\b|[€$£]\s?\d/i;
    const CLIENTS = /\b(?:Claude|ChatGPT|OpenAI|Anthropic|Codex|Cursor|Copilot|Gemini|Zapier|n8n)\b/;
    const VERBS = [...new Set(ALL_TOOLS.map((t) => t.name.split('_')[0]))];
    const TOOL_WORD = new RegExp(`\\b(?:${VERBS.join('|')})_[a-z_]*[a-z]\\b`, 'g');
    for (const name of NAMES) {
      for (const text of texts(tool(tools, name))) {
        assert.equal(COMMERCE.exec(text)?.[0], undefined, `${name}: ${text.slice(0, 60)}`);
        assert.equal(CLIENTS.exec(text)?.[0], undefined, `${name}: ${text.slice(0, 60)}`);
        for (const [word] of text.matchAll(TOOL_WORD)) assert.ok(names.has(word), `${name} names ${word}`);
      }
    }
    // Negative controls: the checks see a pitch, a client and a tool from elsewhere.
    assert.ok(COMMERCE.test('Available on every plan, including the trial.') && COMMERCE.test('subscribe to events'));
    assert.ok(CLIENTS.test('Paste the URL into Zapier.'));
    assert.deepEqual([...'then call reply_to_inbox_item'.matchAll(TOOL_WORD)].map(([w]) => w), ['reply_to_inbox_item']);
  });

  test(`${binding}: a port without the webhook methods skips exactly those tools`, () => {
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args.join(' '));
    let full;
    let older;
    let partial;
    try {
      full = build(recordingPort().port);
      older = build(recordingPort(Object.values(WEBHOOK_TOOLS)).port);
      partial = build(recordingPort(['listWebhookDeliveries']).port);
    } finally {
      console.error = original;
    }
    const view = (tools) => tools.map((t) => [t.name, t.description, t.annotations, Object.keys(t.inputSchema)]);
    assert.deepEqual(view(older), view(full.filter((t) => !NAMES.includes(t.name))));
    assert.deepEqual(view(partial), view(full.filter((t) => t.name !== 'list_webhook_deliveries')));
    // One line per skipped tool: the seven for the older port, then the one for the partial port.
    assert.deepEqual(
      logged,
      [...NAMES, 'list_webhook_deliveries'].map(
        (name) =>
          `[postfast-mcp/core] skipping tool "${name}": the backend port does not implement ${WEBHOOK_TOOLS[name]}() yet (older adapter, newer catalog)`,
      ),
    );
  });
}

test('remote: only admins, and every change to where events go waits for the user', () => {
  const remote = SURFACES.remote(recordingPort().port);
  const stdio = SURFACES.stdio(recordingPort().port);
  for (const name of NAMES) {
    assert.match(
      tool(remote, name).description,
      /Only workspace admins can use this tool; for anyone else it fails with webhook\.forbidden, which reconnecting doesn't fix\.$/,
      name,
    );
    // The API key of the stdio server is not a member, so the rule and the code never apply there.
    assert.ok(!tool(stdio, name).description.includes('webhook.forbidden'), name);
    // Both bindings share every word before the remote additions.
    assert.ok(tool(remote, name).description.startsWith(tool(stdio, name).description.replace(/ The deletion cannot be undone\.$/, '')), name);
  }
  assert.match(tool(remote, 'create_webhook_endpoint').description, /every such event, with its post or account data, goes to that URL/);
});
