#!/usr/bin/env node
// Diffs the stdio tool surface of two server commands (old vs new) over real
// MCP: spawn each, initialize, tools/list, compare. Listing must never need a
// live key, so a fake POSTFAST_API_KEY is injected.
//
// Usage: node scripts/parity-diff.mjs [oldCmd] [newCmd]
//   default oldCmd: "npx -y postfast-mcp@0.1.24"
//   default newCmd: "node dist/stdio/index.js"
//
// Exit 0 when tool names + input schemas + descriptions are identical and the
// only additions are title/outputSchema/annotations; exit 1 otherwise, with
// every difference printed for the PR body.

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const OLD_CMD = process.argv[2] ?? 'npx -y postfast-mcp@0.1.24';
const NEW_CMD = process.argv[3] ?? 'node dist/stdio/index.js';
const INTENDED_ADDITIONS = new Set(['title', 'outputSchema', 'annotations']);

function listTools(command, cwd) {
  return new Promise((resolvePromise, reject) => {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, POSTFAST_API_KEY: 'pf-parity-fake-key' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command}: timed out waiting for tools/list`));
    }, 120_000);

    let buffer = '';
    let stderr = '';
    const pending = new Map();
    let initialize;

    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (pending.size > 0) {
        clearTimeout(timer);
        reject(new Error(`${command}: exited (${code}) before responding\n${stderr}`));
      }
    });

    function send(id, method, params) {
      return new Promise((res) => {
        pending.set(id, res);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    }

    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const resolver = pending.get(msg.id);
        if (resolver) {
          pending.delete(msg.id);
          resolver(msg);
        }
      }
    });

    (async () => {
      const initRes = await send(1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'parity-diff', version: '0.0.0' },
      });
      initialize = initRes.result;
      child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
      );
      const listRes = await send(2, 'tools/list', {});
      clearTimeout(timer);
      child.kill();
      if (listRes.error) throw new Error(JSON.stringify(listRes.error));
      resolvePromise({ initialize, tools: listRes.result.tools });
    })().catch((err) => {
      clearTimeout(timer);
      child.kill();
      reject(err);
    });
  });
}

/** Stable stringify (sorted keys) so object key order never reads as a diff. */
function canonical(value) {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

console.error(`old: ${OLD_CMD}`);
console.error(`new: ${NEW_CMD}`);
// The old side must NOT run from this repo: npx would satisfy postfast-mcp
// from the cwd project instead of the registry and find no bin.
const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const neutralCwd = mkdtempSync(join(tmpdir(), 'postfast-parity-'));
const [oldSide, newSide] = await Promise.all([
  listTools(OLD_CMD, neutralCwd),
  listTools(NEW_CMD, repoRoot),
]);

const oldByName = new Map(oldSide.tools.map((t) => [t.name, t]));
const newByName = new Map(newSide.tools.map((t) => [t.name, t]));

let failures = 0;
const report = [];
const push = (line, isFailure = false) => {
  report.push(line);
  if (isFailure) failures += 1;
};

push(`# stdio parity: ${OLD_CMD} -> ${NEW_CMD}`);
push('');
push(`old tools: ${oldSide.tools.length}, new tools: ${newSide.tools.length}`);

const oldOrder = oldSide.tools.map((t) => t.name);
const newOrder = newSide.tools.map((t) => t.name);
if (oldOrder.join() !== newOrder.join()) {
  const missing = oldOrder.filter((n) => !newByName.has(n));
  const added = newOrder.filter((n) => !oldByName.has(n));
  if (missing.length || added.length) {
    push(`FAIL tool set changed. missing: [${missing}] added: [${added}]`, true);
  } else {
    push(`FAIL tool order changed: [${newOrder}]`, true);
  }
} else {
  push(`OK   tool names + order identical: [${oldOrder.join(', ')}]`);
}

push('');
for (const name of oldOrder) {
  const oldTool = oldByName.get(name);
  const newTool = newByName.get(name);
  if (!newTool) continue;

  if (oldTool.description === newTool.description) {
    push(`OK   ${name}: description identical`);
  } else {
    push(`DIFF ${name}: description changed`, true);
    push(`  - old: ${JSON.stringify(oldTool.description)}`);
    push(`  + new: ${JSON.stringify(newTool.description)}`);
  }

  if (canonical(oldTool.inputSchema) === canonical(newTool.inputSchema)) {
    push(`OK   ${name}: inputSchema identical`);
  } else {
    push(`DIFF ${name}: inputSchema changed`, true);
    push(`  - old: ${canonical(oldTool.inputSchema)}`);
    push(`  + new: ${canonical(newTool.inputSchema)}`);
  }

  const oldKeys = new Set(Object.keys(oldTool));
  const addedKeys = Object.keys(newTool).filter((k) => !oldKeys.has(k));
  const removedKeys = [...oldKeys].filter((k) => !(k in newTool));
  const unexpected = addedKeys.filter((k) => !INTENDED_ADDITIONS.has(k));
  if (removedKeys.length) push(`FAIL ${name}: fields removed: ${removedKeys}`, true);
  if (unexpected.length) push(`FAIL ${name}: unintended additions: ${unexpected}`, true);
  if (addedKeys.length) push(`ADD  ${name}: +${addedKeys.join(' +')}`);
}

push('');
const oldInstructions = oldSide.initialize?.instructions;
const newInstructions = newSide.initialize?.instructions;
if (!oldInstructions && newInstructions) {
  push('ADD  initialize: server instructions (none before)');
} else if (oldInstructions !== newInstructions) {
  push('DIFF initialize: instructions changed', true);
}

push('');
push(failures === 0 ? 'RESULT: parity clean (only intended additions)' : `RESULT: ${failures} difference(s)`);
console.log(report.join('\n'));
process.exit(failures === 0 ? 0 : 1);
