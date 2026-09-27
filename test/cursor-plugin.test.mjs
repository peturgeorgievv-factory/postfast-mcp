// The Cursor plugin manifest (.cursor-plugin/plugin.json), checked against the
// package it launches, the Claude Code plugin it mirrors, and the rules
// Cursor's marketplace checks at submission. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const manifest = JSON.parse(read('.cursor-plugin/plugin.json'));
const pkg = JSON.parse(read('package.json'));
const claude = JSON.parse(read('.claude-plugin/plugin.json'));

test('the Cursor plugin launches this release of the server, like the Claude Code plugin', () => {
  assert.equal(manifest.name, 'postfast');
  assert.match(manifest.name, /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
  assert.equal(manifest.version, pkg.version);
  assert.deepEqual(manifest.mcpServers.postfast.args, ['-y', `postfast-mcp@${pkg.version}`]);
  assert.deepEqual(manifest.mcpServers, claude.mcpServers);
  assert.deepEqual(readdirSync(join(ROOT, '.cursor-plugin')), ['plugin.json']);
});

test('every ${VAR} in the server config is a declared, required, write-only variable', () => {
  const used = [...JSON.stringify(manifest.mcpServers).matchAll(/\$\{(?:env:)?([A-Za-z_]\w*)\}/g)].map(
    ([, name]) => name,
  );
  assert.ok(used.length > 0);
  const { type, properties, required } = manifest.variables;
  assert.equal(type, 'object');
  for (const name of used) {
    assert.ok(properties[name], `${name} is not declared under variables`);
    assert.ok(required.includes(name), `${name} is not required`);
    assert.equal(properties[name].writeOnly, true, `${name} is not write-only`);
  }
});

test('manifest paths are relative and their files exist', () => {
  for (const field of ['logo', 'skills']) {
    const value = manifest[field];
    assert.ok(!isAbsolute(value) && !value.split('/').includes('..'), `${field}: ${value}`);
    assert.ok(existsSync(join(ROOT, value)), `${field}: ${value} is missing`);
  }

  // Every skill Cursor discovers has the frontmatter it requires.
  for (const dir of readdirSync(join(ROOT, manifest.skills))) {
    const front = /^---\n([\s\S]*?)\n---\n/.exec(read(join(manifest.skills, dir, 'SKILL.md')))?.[1] ?? '';
    assert.match(front, new RegExp(`^name: ${dir}$`, 'm'), dir);
    assert.match(front, /^description: \S/m, dir);
  }

  // The logo is a complete, square PNG of at least 128 px.
  const png = readFileSync(join(ROOT, manifest.logo));
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  assert.equal(png.toString('latin1', png.length - 8, png.length - 4), 'IEND');
  const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  assert.ok(width === height && width >= 128, `logo is ${width}x${height}`);
});
