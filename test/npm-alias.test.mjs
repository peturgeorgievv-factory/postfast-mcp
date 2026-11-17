// The `postfast` package on npm (packages/postfast): the same server as
// postfast-mcp, under the bare name. Checked against the root package it pins,
// the MCP Registry entry that lists it, and over real stdio. Run with
// `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ALIAS_DIR = join(ROOT, 'packages/postfast');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const alias = JSON.parse(read('packages/postfast/package.json'));
const server = JSON.parse(read('server.json'));

test('postfast pins this exact release of postfast-mcp and carries its identity', () => {
  assert.equal(alias.name, 'postfast');
  assert.equal(alias.version, pkg.version);
  assert.deepEqual(alias.dependencies, { 'postfast-mcp': pkg.version });
  assert.equal(alias.type, 'module');
  assert.deepEqual(alias.bin, { postfast: 'bin/postfast.js' });
  assert.deepEqual(alias.engines, pkg.engines);
  assert.equal(alias.license, pkg.license);
  assert.equal(read('packages/postfast/LICENSE'), read('LICENSE'));
  // npm checks provenance against the repository URL, so it must name this repo.
  assert.equal(alias.repository.url, pkg.repository.url);
  assert.equal(alias.repository.directory, 'packages/postfast');
  assert.match(alias.homepage, /^https:\/\/postfa\.st(\/|$)/);
});

test('the MCP Registry entry lists postfast, and both packages claim that entry', () => {
  assert.equal(server.name, 'st.postfa/postfast');
  assert.equal(alias.mcpName, server.name);
  assert.equal(pkg.mcpName, server.name);
  const [npmPackage, ...rest] = server.packages;
  assert.deepEqual(rest, []);
  assert.equal(npmPackage.registryType, 'npm');
  assert.equal(npmPackage.identifier, alias.name);
  assert.equal(npmPackage.version, alias.version);
  assert.equal(server.version, alias.version);
});

test('the postfast tarball holds the bin, its README and its license, and the other packages leave it out', () => {
  const out = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ALIAS_DIR, encoding: 'utf8' }),
  );
  // npm 12 keys the result by package name; earlier versions return an array.
  const [packed] = Array.isArray(out) ? out : Object.values(out);
  assert.deepEqual(packed.files.map((f) => f.path).sort(), ['LICENSE', 'README.md', 'bin/postfast.js', 'package.json']);
  assert.ok(!pkg.files.some((entry) => entry.startsWith('packages')));
  assert.match(read('.mcpbignore'), /^\/packages\/$/m);
});

/** Starts a stdio server, lists its tools, and closes it. */
async function surface(args) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    env: { ...process.env, POSTFAST_API_KEY: 'test-key-not-used' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'npm-alias', version: '0.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return {
      server: client.getServerVersion(),
      instructions: client.getInstructions(),
      tools: tools.map((t) => t.name).sort(),
    };
  } finally {
    await client.close();
  }
}

test('npx postfast serves the same server as postfast-mcp', async () => {
  // The layout npm installs: node_modules/postfast next to node_modules/postfast-mcp.
  const dir = mkdtempSync(join(tmpdir(), 'postfast-alias-'));
  try {
    const modules = join(dir, 'node_modules');
    mkdirSync(modules);
    cpSync(ALIAS_DIR, join(modules, 'postfast'), { recursive: true });
    symlinkSync(ROOT, join(modules, 'postfast-mcp'), 'dir');

    const viaAlias = await surface([join(modules, 'postfast', alias.bin.postfast)]);
    const direct = await surface([join(ROOT, pkg.bin['postfast-mcp'])]);

    assert.deepEqual(viaAlias, direct);
    assert.equal(viaAlias.server.version, pkg.version);
    assert.ok(viaAlias.tools.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
