// The remote surface every hosted session gets, pinned: server instructions,
// capabilities and tools/list, rendered through the SDK with the host's
// options (remote binding, per-call workspaceId, confirm secret; calendar app
// off). Any change to what hosted clients see fails here until the snapshot
// is updated on purpose:
//
//   UPDATE_SNAPSHOT=1 npm test    # then review the diff of test/snapshots/
//
// tools/list is read with a schema that keeps fields the SDK's own Tool type
// doesn't know (securitySchemes), in the order the client's listTools() gives
// the rest. The render uses this repo's locked SDK and zod, so bumping either
// can change the snapshot without a catalogue change (zod renders its email
// pattern differently between minors, for one): review those diffs the same
// way. The stdio surface is checked against the published package with
// scripts/parity-diff.mjs instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListToolsResultSchema, ToolSchema } from '@modelcontextprotocol/sdk/types.js';
import { instructionsFor, registerCatalogTools } from '../dist/core/index.js';

const SNAPSHOT = new URL('./snapshots/remote-surface.json', import.meta.url);
const ListedTools = ListToolsResultSchema.extend({ tools: ToolSchema.passthrough().array() });

async function renderRemote() {
  // Every port method exists, so no tool is skipped; none is called.
  const port = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : async () => ({})) });
  const server = new McpServer(
    { name: 'remote-surface', version: '0.0.0' },
    { capabilities: { tools: {}, logging: {} }, instructions: instructionsFor('remote') },
  );
  registerCatalogTools(server, {
    binding: 'remote',
    withWorkspaceField: true,
    port,
    confirmGate: { secret: 'remote-surface-snapshot-secret-32' },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'remote-surface', version: '0.0.0' });
  await client.connect(clientTransport);
  const surface = {
    instructions: client.getInstructions(),
    capabilities: client.getServerCapabilities(),
    ...(await client.request({ method: 'tools/list' }, ListedTools)),
  };
  await client.close();
  await server.close();
  return `${JSON.stringify(surface, null, 2)}\n`;
}

test('the remote surface matches its snapshot', async () => {
  const rendered = await renderRemote();
  if (process.env.UPDATE_SNAPSHOT === '1') {
    mkdirSync(new URL('./snapshots/', import.meta.url), { recursive: true });
    writeFileSync(SNAPSHOT, rendered);
  }
  assert.ok(existsSync(SNAPSHOT), 'No snapshot yet: run UPDATE_SNAPSHOT=1 npm test to create it.');
  const pinned = readFileSync(SNAPSHOT, 'utf8');
  assert.ok(
    rendered === pinned,
    'The remote surface changed. Review what hosted clients will see, then run UPDATE_SNAPSHOT=1 npm test to accept it.',
  );
  // The snapshot is the confirm-gated surface, one tool per comment operation.
  const { tools, instructions } = JSON.parse(pinned);
  const names = tools.map((t) => t.name);
  assert.equal(names.length, 31);
  for (const name of [
    'preview_comment_reply',
    'reply_to_comment',
    'preview_private_reply',
    'send_private_reply',
    'preview_comment_deletion',
    'delete_comment',
  ]) {
    assert.ok(names.includes(name), name);
  }
  for (const name of ['prepare_inbox_action', 'confirm_inbox_action', 'reply_to_inbox_item', 'send_inbox_private_reply']) {
    assert.ok(!names.includes(name), name);
  }
  assert.match(instructions, /approve_posts only after they say yes/);
  // Every tool lists its OAuth scopes, at the top level and in _meta.
  for (const tool of tools) {
    assert.equal(tool.securitySchemes?.[0]?.type, 'oauth2', tool.name);
    assert.deepEqual(tool._meta?.securitySchemes, tool.securitySchemes, tool.name);
  }
});
