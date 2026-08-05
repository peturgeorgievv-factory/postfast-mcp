#!/usr/bin/env node
// Propagates package.json's version (already bumped by `changeset version`)
// across every other spot that carries it. Runs as part of `npm run version`,
// so the Version Packages PR ships all stamps in one commit.
//
// Stamps: manifest.json, server.json (top-level + packages[]),
// .claude-plugin/plugin.json (plugin update detection keys off this file's
// version inside the npm package), .claude-plugin/marketplace.json (plugins[]),
// src/stdio/index.ts, and package-lock.json (regenerated via npm).
// JSON files are edited textually to preserve their checked-in formatting;
// in each of them every `"version": "x.y.z"` key is one of our stamps
// ("manifest_version" and dependency ranges never match the pattern).

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`package.json version "${version}" is not x.y.z — aborting`);
  process.exit(1);
}

console.log(`Stamping ${version}`);

/** Replace every "version": "x.y.z" stamp in a JSON file, preserving formatting. */
function stampJson(relPath) {
  const path = join(root, relPath);
  const raw = readFileSync(path, 'utf8');
  const stamped = raw.replace(/("version":\s*")\d+\.\d+\.\d+(")/g, `$1${version}$2`);
  if (stamped === raw && !raw.includes(`"version": "${version}"`)) {
    console.error(`${relPath}: no version stamp found — aborting`);
    process.exit(1);
  }
  JSON.parse(stamped); // sanity: still valid JSON
  writeFileSync(path, stamped);
  console.log(`  ${relPath}`);
}

stampJson('manifest.json');
stampJson('server.json');
stampJson('.claude-plugin/plugin.json');
stampJson('.claude-plugin/marketplace.json');

// src/stdio/index.ts — the MCP server's self-reported version literal.
const indexPath = join(root, 'src/stdio/index.ts');
const indexSrc = readFileSync(indexPath, 'utf8');
const stampedIndex = indexSrc.replace(/version: '\d+\.\d+\.\d+'/, `version: '${version}'`);
if (!stampedIndex.includes(`version: '${version}'`)) {
  console.error('src/stdio/index.ts: version literal not found — aborting (lockfile not touched)');
  process.exit(1);
}
writeFileSync(indexPath, stampedIndex);
console.log('  src/stdio/index.ts');

// package-lock.json — regenerate both version fields from package.json.
execSync('npm install --package-lock-only', { cwd: root, stdio: 'inherit' });
console.log('  package-lock.json');

console.log(`\nStamped ${version} everywhere.`);
