// generate_connect_link's skipConnectPage: the field on both bindings, what
// its description promises, and that it reaches the port only when given.
// Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildTools, registerCatalogTools } from '../dist/core/index.js';

const WS = '33333333-3333-4333-8333-333333333333';
const SECRET = 'connect-link-test-secret-32chars';

/** A port that records every call and answers with a connect URL. */
function recordingPort() {
  const calls = [];
  const port = new Proxy(
    {},
    {
      get: (_t, method) =>
        method === 'then'
          ? undefined
          : async (...args) => {
              calls.push({ method, args });
              return { connectUrl: 'https://app.example.test/connect?token=t' };
            },
    },
  );
  return { port, calls };
}

const OPTIONS = {
  stdio: { binding: 'stdio' },
  remote: { binding: 'remote', withWorkspaceField: true, confirmGate: { secret: SECRET } },
};
const tool = (tools, name) => tools.find((t) => t.name === name);
const parse = (t, args) => z.object(t.inputSchema).safeParse(args);

async function listed(binding) {
  const server = new McpServer({ name: 'connect-link', version: '0.0.0' }, { capabilities: { tools: {} } });
  registerCatalogTools(server, { ...OPTIONS[binding], port: recordingPort().port });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'connect-link', version: '0.0.0' });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  await Promise.all([client.close(), server.close()]);
  return tools;
}

for (const binding of ['stdio', 'remote']) {
  const ws = binding === 'remote' ? WS : undefined;

  test(`${binding}: generate_connect_link passes skipConnectPage on, and leaves it out when not given`, async () => {
    const { port, calls } = recordingPort();
    const link = tool(buildTools({ ...OPTIONS[binding], port }), 'generate_connect_link');
    const call = async (args) => {
      const { workspaceId, ...rest } = parse(link, { ...args, ...(ws ? { workspaceId: ws } : {}) }).data;
      await link.run(port, rest, workspaceId);
      return calls.at(-1);
    };

    const skipped = await call({ platforms: ['TIKTOK'], redirectUrl: 'https://app.example.com/done', skipConnectPage: true });
    assert.equal(skipped.method, 'generateConnectLink');
    assert.equal(skipped.args[0].skipConnectPage, true);
    assert.deepEqual(skipped.args[0].platforms, ['TIKTOK']);
    assert.equal(skipped.args[1], ws);

    assert.equal((await call({ platforms: ['TIKTOK'], skipConnectPage: false })).args[0].skipConnectPage, false);
    // No default: a link made without it is today's link.
    assert.ok(!('skipConnectPage' in (await call({ platforms: ['TIKTOK'] })).args[0]));

    // The backend's two rules (one platform, no email) stay server-side: it answers 400 with the reason.
    assert.equal(parse(link, { skipConnectPage: true }).success, true);
    assert.equal(parse(link, { skipConnectPage: 'yes' }).success, false);
  });

  test(`${binding}: skipConnectPage is an optional boolean whose description states the backend's rules`, async () => {
    const t = tool(await listed(binding), 'generate_connect_link');
    const field = t.inputSchema.properties.skipConnectPage;
    assert.equal(field.type, 'boolean');
    assert.ok(!('default' in field));
    assert.ok(!(t.inputSchema.required ?? []).includes('skipConnectPage'));
    for (const pattern of [
      /^Skip the PostFast connect page, for a link your own product opens/,
      /Needs exactly one platform in platforms, and not with sendEmail\./,
      /LINKEDIN, BLUESKY and TELEGRAM links show the connect page anyway/,
      /a FACEBOOK link still stops at the Pages picker/,
    ]) {
      assert.match(field.description, pattern);
    }
    assert.match(t.inputSchema.properties.redirectUrl.description, /with skipConnectPage, the user is sent there directly/);
    assert.match(t.description, /can skip the PostFast connect page \(skipConnectPage\)/);
  });
}
