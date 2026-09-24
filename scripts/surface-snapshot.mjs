#!/usr/bin/env node
// Renders the catalog surface a client receives (server instructions +
// tools/list) through the real SDK: McpServer + registerCatalogTools, listed
// by a Client over an in-memory transport. The remote modes use the deployed
// host's options (remote binding + the per-call workspaceId field).
//
// Usage: node scripts/surface-snapshot.mjs <stdio|remote|remote-gated> [outDir]
// Writes <mode>.raw.json (as returned, key order kept, so a parameter-order
// change shows) and <mode>.json (keys sorted, array order kept). Compare two
// renders with cmp on both files.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { instructionsFor, registerCatalogTools } from '../dist/core/index.js';

const MODES = ['stdio', 'remote', 'remote-gated'];
const mode = process.argv[2];
const outDir = process.argv[3] ?? '.';
if (!MODES.includes(mode)) {
  console.error(`usage: surface-snapshot.mjs <${MODES.join('|')}> [outDir]`);
  process.exit(2);
}

const binding = mode === 'stdio' ? 'stdio' : 'remote';
const gated = mode === 'remote-gated';

// Every port method exists (so no portMethod tool is skipped); none is called.
// `then` stays undefined so nothing mistakes the port for a promise.
const port = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : async () => ({})) });

const server = new McpServer(
  { name: 'surface-snapshot', version: '0.0.0' },
  { instructions: gated ? instructionsFor('remote', { gated: true }) : instructionsFor(binding) },
);
registerCatalogTools(server, {
  binding,
  port,
  ...(binding === 'remote' ? { withWorkspaceField: true } : {}),
  ...(gated ? { confirmGate: { secret: 'surface-snapshot-fixed-secret-32' } } : {}),
});

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: 'surface-snapshot', version: '0.0.0' });
await client.connect(clientTransport);
const raw = { instructions: client.getInstructions(), ...(await client.listTools()) };
await client.close();
await server.close();

const sortKeys = (value) =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]))
      : value;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${mode}.raw.json`), `${JSON.stringify(raw, null, 2)}\n`);
writeFileSync(join(outDir, `${mode}.json`), `${JSON.stringify(sortKeys(raw), null, 2)}\n`);
console.error(`${mode}: ${raw.tools.length} tools -> ${join(outDir, mode)}{.raw,}.json`);
