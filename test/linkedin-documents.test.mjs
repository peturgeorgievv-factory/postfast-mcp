// LinkedIn documents: the two create_posts controls, what their descriptions
// promise, and PDF, Word and PowerPoint files through the upload tools, on
// both bindings, against the built dist. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  DOCUMENT_MIME_TYPES,
  buildTools,
  instructionsFor,
  registerCatalogTools,
  uploadTypeFor,
} from '../dist/core/index.js';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const WS = '33333333-3333-4333-8333-333333333333';
const DOCUMENT_KEY = 'file/5d0c7a9e-8b1f-4c2e-9f3a-6e4b2d1c0a9f.pdf';
const SECRET = 'linkedin-documents-test-secret-32';

/** A port that records every call and answers with `answer`. */
function recordingPort(answer = { ok: true }) {
  const calls = [];
  const port = new Proxy(
    {},
    {
      get: (_t, method) =>
        method === 'then'
          ? undefined
          : async (...args) => {
              calls.push({ method, args });
              return answer;
            },
    },
  );
  return { port, calls };
}

const OPTIONS = {
  stdio: { binding: 'stdio' },
  remote: { binding: 'remote', withWorkspaceField: true, confirmGate: { secret: SECRET } },
};
const UPLOAD_TOOLS = { stdio: ['upload_media', 'get_upload_urls'], remote: ['upload_media', 'upload_from_url'] };
const EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'];
const tool = (tools, name) => tools.find((t) => t.name === name);
const parse = (t, args) => z.object(t.inputSchema).safeParse(args);
const linkedinLine = (binding) => instructionsFor(binding).split('\n').filter((line) => line.startsWith('- LinkedIn: '));

/** tools/list as a client receives it, through the SDK. */
async function listed(binding) {
  const server = new McpServer({ name: 'linkedin-documents', version: '0.0.0' }, { capabilities: { tools: {} } });
  registerCatalogTools(server, { ...OPTIONS[binding], port: recordingPort().port });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'linkedin-documents', version: '0.0.0' });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  await Promise.all([client.close(), server.close()]);
  return tools;
}

// What the texts must never claim (negative controls below).
const NEVER = {
  'documents on another platform': /\b(?:Facebook|Instagram|TikTok|YouTube|Threads|Pinterest|Bluesky|Telegram|Google Business)\b/,
  'several documents per post': /\b(?:several|multiple|more than one|many)\b[^.]*\bdocuments\b/i,
};

for (const binding of ['stdio', 'remote']) {
  const ws = binding === 'remote' ? WS : undefined;
  const build = (port) => buildTools({ ...OPTIONS[binding], port });

  test(`${binding}: create_posts keeps linkedinAttachmentKey and linkedinAttachmentTitle and sends them on`, async () => {
    const { port, calls } = recordingPort();
    const create = tool(build(port), 'create_posts');
    const controls = { linkedinAttachmentKey: DOCUMENT_KEY, linkedinAttachmentTitle: '7 Claude prompts for LinkedIn' };
    const post = { content: 'Swipe through, copy the prompts.', socialMediaId: ACCOUNT };
    const args = { posts: [post], status: 'DRAFT', controls: { ...controls, notAControl: 'dropped' } };

    assert.deepEqual(parse(create, args).data.controls, controls);
    // Clients that stringify complex params get the same result.
    assert.deepEqual(parse(create, { ...args, controls: JSON.stringify(args.controls) }).data.controls, controls);

    const { workspaceId, ...rest } = parse(create, { ...args, ...(ws ? { workspaceId: ws } : {}) }).data;
    await create.run(port, rest, workspaceId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'createPosts');
    assert.deepEqual(calls[0].args[0].controls, controls);
    assert.equal(calls[0].args[1], ws);

    // A document never rides in mediaItems: their type is IMAGE or VIDEO only.
    const asMedia = { ...post, mediaItems: [{ key: DOCUMENT_KEY, type: 'DOCUMENT', sortOrder: 0 }] };
    assert.equal(parse(create, { ...args, posts: [asMedia] }).success, false);
  });

  test(`${binding}: the document descriptions state the backend's rules`, async () => {
    const tools = await listed(binding);
    const props = tool(tools, 'create_posts').inputSchema.properties.controls.properties;

    const key = props.linkedinAttachmentKey;
    assert.equal(key.type, 'string');
    for (const pattern of [
      /a PDF, Word or PowerPoint file, at most 60 MB/,
      /file\/<uuid>\.pdf, \.doc, \.docx, \.ppt or \.pptx/,
      /Upload the file before this call, and never put its key in mediaItems/,
      /either this document or mediaItems, never both: a post with both fails to publish/,
      /Set linkedinAttachmentTitle with it/,
      /Used only by LinkedIn posts; applies to every LinkedIn post in this call/,
    ]) {
      assert.match(key.description, pattern);
    }
    // It names this surface's upload tools, and no other surface's.
    for (const name of UPLOAD_TOOLS[binding]) assert.ok(key.description.includes(name), name);
    const elsewhere = binding === 'stdio' ? 'upload_from_url' : 'get_upload_urls';
    assert.ok(!key.description.includes(elsewhere), elsewhere);
    assert.ok(key.description.includes(binding === 'stdio' ? 'the key (' : 'the media_id ('));

    const title = props.linkedinAttachmentTitle;
    assert.equal(title.type, 'string');
    assert.match(title.description, /without one, the post shows the title "Document"/);
    assert.match(title.description, /Used only with linkedinAttachmentKey/);

    for (const text of [key.description, title.description, ...linkedinLine(binding)]) {
      for (const [claim, pattern] of Object.entries(NEVER)) assert.doesNotMatch(text, pattern, claim);
    }
  });

  test(`${binding}: the upload tools take documents and say where a DOCUMENT key goes`, async () => {
    const tools = await listed(binding);
    for (const name of UPLOAD_TOOLS[binding]) {
      const t = tool(tools, name);
      const text = [t.description, ...Object.values(t.inputSchema.properties).map((p) => p.description)].join('\n');
      assert.match(t.description, /controls\.linkedinAttachmentKey(?: instead)?, never in mediaItems/, name);
      for (const ext of EXTENSIONS) assert.match(text, new RegExp(`\\${ext}\\b`), `${name}: ${ext}`);
      // upload_media on stdio reads a local file, so it takes no MIME type.
      if (!(binding === 'stdio' && name === 'upload_media')) {
        for (const mime of DOCUMENT_MIME_TYPES) assert.ok(text.includes(mime), `${name}: ${mime}`);
      }
      if (name !== 'get_upload_urls') assert.match(t.description, /DOCUMENT/, name);
    }
    if (binding === 'stdio') {
      const urls = tool(tools, 'get_upload_urls').inputSchema.properties;
      assert.equal(urls.count.description, 'Number of upload URLs (1-8 for images, 1 for videos, caption files and documents)');
    } else {
      const fromUrl = tool(tools, 'upload_from_url');
      // A share page would be stored as the document, since the model sets the type itself.
      assert.match(fromUrl.description, /For a caption file or a document, link to the file itself; a share page doesn't work\./);
      assert.match(fromUrl.inputSchema.properties.contentType.description, /only if the source sends a generic type such as application\/octet-stream, e\.g\. application\/pdf for \.pdf/);
      assert.match(tool(tools, 'upload_media').inputSchema.properties.contentType.description, /application\/pdf for a PDF/);
    }
  });
}

test('the LinkedIn line of the instructions says how to attach a document, the same on both bindings', () => {
  const [stdio, remote] = ['stdio', 'remote'].map(linkedinLine);
  assert.equal(stdio.length, 1);
  assert.deepEqual(stdio, remote);
  assert.match(stdio[0], /PDF, Word or PowerPoint document/);
  assert.match(stdio[0], /upload it, then pass its key as controls\.linkedinAttachmentKey \(never in mediaItems, and not with images or a video on the same post\)/);
  assert.match(stdio[0], /its title as controls\.linkedinAttachmentTitle/);
});

test('the never-say patterns catch the claims they exist for', () => {
  const bad = {
    'documents on another platform': 'Attach the PDF to Facebook posts the same way.',
    'several documents per post': 'A post can carry several documents.',
  };
  for (const [claim, sentence] of Object.entries(bad)) assert.match(sentence, NEVER[claim], claim);
  assert.doesNotMatch('A LinkedIn post with images, a video or a different document', NEVER['several documents per post']);
});

test('uploadTypeFor: PDF, Word and PowerPoint files as DOCUMENT', () => {
  assert.deepEqual([...DOCUMENT_MIME_TYPES], [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]);
  for (const mime of DOCUMENT_MIME_TYPES) assert.equal(uploadTypeFor(mime), 'DOCUMENT', mime);
  assert.equal(uploadTypeFor(' Application/PDF; name="prompts.pdf"'), 'DOCUMENT');
  // Other documents LinkedIn doesn't take, a share page, and a generic type stay unsupported.
  for (const mime of ['application/vnd.oasis.opendocument.text', 'application/rtf', 'text/html', 'application/octet-stream']) {
    assert.equal(uploadTypeFor(mime), undefined, mime);
  }
});
