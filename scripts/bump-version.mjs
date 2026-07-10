#!/usr/bin/env node
// Stamps the package version across every spot that carries it, in one shot.
// Usage: node scripts/bump-version.mjs <patch|minor|x.y.z>
//
// Stamps: package.json, manifest.json, server.json (top-level + packages[]),
// .claude-plugin/plugin.json, .claude-plugin/marketplace.json (plugins[]),
// src/index.ts, and package-lock.json (regenerated via npm).
// JSON files are edited textually to preserve their checked-in formatting;
// in each of them every `"version": "x.y.z"` key is one of our stamps
// ("manifest_version" and dependency ranges never match the pattern).

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|x.y.z>');
  process.exit(1);
}

const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

function nextVersion(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'patch') {
    return `${major}.${minor}.${patch + 1}`;
  }
  if (kind === 'minor') {
    return `${major}.${minor + 1}.0`;
  }
  return kind; // explicit x.y.z
}

const next = nextVersion(current, arg);
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`Invalid target "${arg}" — pass patch, minor, or x.y.z`);
  process.exit(1);
}

console.log(`${current} -> ${next}`);

/** Replace every "version": "x.y.z" stamp in a JSON file, preserving formatting. */
function stampJson(relPath) {
  const path = join(root, relPath);
  const raw = readFileSync(path, 'utf8');
  const stamped = raw.replace(/("version":\s*")\d+\.\d+\.\d+(")/g, `$1${next}$2`);
  if (stamped === raw) {
    console.error(`${relPath}: no version stamp found — aborting`);
    process.exit(1);
  }
  JSON.parse(stamped); // sanity: still valid JSON
  writeFileSync(path, stamped);
  console.log(`  ${relPath}`);
}

stampJson('package.json');
stampJson('manifest.json');
stampJson('server.json');
stampJson('.claude-plugin/plugin.json');
stampJson('.claude-plugin/marketplace.json');

// src/index.ts — the MCP server's self-reported version literal.
const indexPath = join(root, 'src/index.ts');
const indexSrc = readFileSync(indexPath, 'utf8');
const stampedIndex = indexSrc.replace(/version: '\d+\.\d+\.\d+'/, `version: '${next}'`);
if (stampedIndex === indexSrc) {
  console.error('src/index.ts: version literal not found — aborting (lockfile not touched)');
  process.exit(1);
}
writeFileSync(indexPath, stampedIndex);
console.log('  src/index.ts');

// package-lock.json — regenerate both version fields from package.json.
execSync('npm install --package-lock-only', { cwd: root, stdio: 'inherit' });
console.log('  package-lock.json');

console.log(`\nStamped ${next} everywhere. Next: npm run build, then npm publish.`);
