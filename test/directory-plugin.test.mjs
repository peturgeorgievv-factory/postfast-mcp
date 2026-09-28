// The directory plugin in plugins/postfast, checked against the built dist.
// Its skills run on the remote binding with the confirm gate on, so they may
// name only tools on that surface; a tool rename fails here instead of
// silently breaking a skill. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TOOLS, buildTools, instructionsFor } from '../dist/core/index.js';

const PLUGIN = fileURLToPath(new URL('../plugins/postfast/', import.meta.url));
const SKILLS = join(PLUGIN, 'skills');
const RULES = join(SKILLS, 'schedule-posts', 'references', 'platform-rules.md');

const read = (path) => readFileSync(path, 'utf8');
const filesUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const skillDocs = filesUnder(SKILLS).filter((path) => path.endsWith('.md'));

const namesOf = (tools) => new Set(tools.map((t) => t.name));
const GATED = namesOf(
  buildTools({
    binding: 'remote',
    withWorkspaceField: true,
    confirmGate: { secret: 'directory-plugin-test-secret-32ch' },
  }),
);
// Names that exist on the stdio or ungated remote surface but not the gated one.
const NOT_GATED = [
  ...namesOf(buildTools({ binding: 'stdio' })),
  ...namesOf(buildTools({ binding: 'remote', withWorkspaceField: true })),
].filter((name) => !GATED.has(name));

// A tool-shaped word: a verb some catalog tool starts with, then snake_case.
const VERBS = [...new Set(ALL_TOOLS.map((t) => t.name.split('_')[0]))];
const TOOL_WORD = new RegExp(`\\b(?:${VERBS.join('|')})_[a-z_]*[a-z]\\b`, 'g');
const toolWords = (text) => [...text.matchAll(TOOL_WORD)].map(([word]) => word);

test('the skills name only tools on the gated remote surface', () => {
  const named = new Map();
  for (const path of skillDocs) {
    for (const word of toolWords(read(path))) {
      named.set(word, [...new Set([...(named.get(word) ?? []), relative(PLUGIN, path)])]);
    }
  }
  const unknown = [...named].filter(([name]) => !GATED.has(name));
  assert.deepEqual(unknown, [], 'named but not on the gated remote surface');

  // The scan catches a name from the other surfaces (negative control).
  assert.ok(NOT_GATED.length > 0);
  for (const name of NOT_GATED) {
    assert.deepEqual(toolWords(`then call \`${name}\` with it`), [name]);
    assert.ok(!named.has(name), name);
  }

  // The gated flow the skills exist to teach.
  for (const name of [
    'approve_posts',
    'prepare_inbox_action',
    'confirm_inbox_action',
    'upload_from_url',
    'upload_media',
    'set_inbox_item_state',
    'generate_connect_link',
  ]) {
    assert.ok(named.has(name), `no skill names ${name}`);
  }
});

test('the plugin reaches PostFast only through the hosted connector', () => {
  const manifest = JSON.parse(read(join(PLUGIN, '.claude-plugin', 'plugin.json')));
  assert.equal(manifest.name, 'postfast');
  assert.equal(manifest.license, 'MIT');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  for (const key of ['mcpServers', 'hooks', 'agents', 'commands', 'lspServers', 'userConfig']) {
    assert.ok(!(key in manifest), `plugin.json declares ${key}`);
  }
  assert.ok(!existsSync(join(PLUGIN, 'bin')), 'a top-level bin/ blocks installs outside the CLI');

  const { mcpServers } = JSON.parse(read(join(PLUGIN, '.mcp.json')));
  assert.deepEqual(mcpServers, { postfast: { type: 'http', url: 'https://mcp.postfa.st/mcp' } });

  for (const path of skillDocs) {
    for (const [url] of read(path).matchAll(/https?:\/\/[^\s)`"'<>\]]+/g)) {
      assert.match(new URL(url).hostname, /(^|\.)postfa\.st$/, `${relative(PLUGIN, path)}: ${url}`);
    }
  }
});

test('the directory listing has its icon and PostFast links', () => {
  // .claude-plugin holds the manifest and the listing icon, nothing else.
  assert.deepEqual(readdirSync(join(PLUGIN, '.claude-plugin')).sort(), ['icon.png', 'plugin.json']);
  const manifest = JSON.parse(read(join(PLUGIN, '.claude-plugin', 'plugin.json')));
  for (const field of ['homepage', 'documentationUrl', 'supportUrl', 'privacyPolicyUrl', 'termsOfServiceUrl']) {
    const url = new URL(manifest[field]);
    assert.equal(url.protocol, 'https:', field);
    assert.match(url.hostname, /(^|\.)postfa\.st$/, field);
  }
  assert.notEqual(manifest.homepage, manifest.documentationUrl);

  // A complete PNG (signature, IHDR first, IEND last), square, at least 128 px.
  const png = readFileSync(join(PLUGIN, '.claude-plugin', 'icon.png'));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString('latin1', 12, 16), 'IHDR');
  assert.equal(png.toString('latin1', png.length - 8, png.length - 4), 'IEND');
  const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  assert.equal(width, height, `icon is ${width}x${height}`);
  assert.ok(width >= 128, `icon is ${width}px`);
});

test('each skill is named for its folder, fits the size limits and its files exist', () => {
  for (const dir of readdirSync(SKILLS)) {
    const text = read(join(SKILLS, dir, 'SKILL.md'));
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
    assert.ok(front, `${dir}: no frontmatter`);
    const field = (key) => new RegExp(`^${key}: (.+)$`, 'm').exec(front)?.[1];
    assert.equal(field('name'), dir);
    assert.match(dir, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const description = field('description') ?? '';
    assert.ok(description.length > 0 && description.length <= 1024, `${dir}: description`);
    assert.ok(text.split('\n').length < 500, `${dir}: SKILL.md is 500 lines or more`);
    for (const [, path] of text.matchAll(/`((?:\.\.\/[a-z0-9-]+\/)?references\/[\w./-]+)`/g)) {
      assert.ok(existsSync(join(SKILLS, dir, path)), `${dir}: ${path} is missing`);
    }
  }
});

test('platform limits are stated once, in the shared platform rules', () => {
  for (const path of skillDocs.filter((p) => p !== RULES)) {
    const limit = /\d[\d,]*\s*(?:characters|chars)\b/i.exec(read(path));
    assert.equal(limit, null, `${relative(PLUGIN, path)} states "${limit?.[0]}"; limits belong in the platform rules`);
  }
  // Every count and limit the gated server instructions give appears in the rules.
  const stated = instructionsFor('remote', { gated: true })
    .split('\n\n')
    .filter((paragraph) => /^(?:Media|Per-platform limits)/.test(paragraph))
    .join('\n');
  const numbers = [...new Set(stated.match(/\d+(?:,\d{3})*/g))];
  assert.ok(numbers.includes('280') && numbers.includes('250'), numbers.join(' '));
  const rules = read(RULES);
  for (const n of numbers) {
    assert.match(rules, new RegExp(`(?<![\\d,])${n}(?![\\d,])`), `the platform rules lack ${n}`);
  }
});
