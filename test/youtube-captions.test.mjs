// YouTube's video language and caption file: the two create_posts controls,
// what their descriptions promise, and caption files through the upload
// tools, on both bindings, against the built dist. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CAPTION_MIME_TYPES,
  buildTools,
  instructionsFor,
  registerCatalogTools,
  uploadTypeFor,
} from '../dist/core/index.js';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const WS = '33333333-3333-4333-8333-333333333333';
const CAPTION_KEY = 'file/0b6f1c9e-3c1a-4f39-9a51-2f0f3c1d2e4a.srt';
const SECRET = 'youtube-captions-test-secret-32ch';

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
const tool = (tools, name) => tools.find((t) => t.name === name);
const parse = (t, args) => z.object(t.inputSchema).safeParse(args);

/** tools/list as a client receives it, through the SDK. */
async function connect(binding, port) {
  const server = new McpServer({ name: 'youtube-captions', version: '0.0.0' }, { capabilities: { tools: {} } });
  registerCatalogTools(server, { ...OPTIONS[binding], port });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'youtube-captions', version: '0.0.0' });
  await client.connect(clientTransport);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}
async function listed(binding) {
  const { client, close } = await connect(binding, recordingPort().port);
  const { tools } = await client.listTools();
  await close();
  return tools;
}

// What the descriptions must never claim (negative controls below).
const NEVER = {
  'captions replace or remove auto-captions': /\b(?:replac|remov|overrid|hid|disabl)\w*/i,
  'several caption tracks per video': /\b(?:several|multiple|more than one|many)\b[^.]*\btracks?\b/i,
  'captions can be changed after publishing': /\b(?:chang|edit|updat)\w*\b[^.]*\bafter\b[^.]*\bpublish/i,
  'untimed transcripts work':
    /\b(?:untimed|without timings?)\b(?![^.;]*\b(?:doesn't|does not|don't|do not|won't|can't|cannot|isn't|aren't)\b)[^.;]*\b(?:works?|is fine|is supported|are supported)\b/i,
};

for (const binding of ['stdio', 'remote']) {
  const ws = binding === 'remote' ? WS : undefined;
  const build = (port) => buildTools({ ...OPTIONS[binding], port });

  test(`${binding}: create_posts keeps youtubeLanguage and youtubeCaptionKey and sends them on`, async () => {
    const { port, calls } = recordingPort();
    const create = tool(build(port), 'create_posts');
    const controls = { youtubeLanguage: 'pt-BR', youtubeCaptionKey: CAPTION_KEY, youtubePrivacy: 'UNLISTED' };
    const post = { content: 'Episode 12', socialMediaId: ACCOUNT, mediaItems: [{ key: 'video/a.mp4', type: 'VIDEO', sortOrder: 0 }] };
    const args = { posts: [post], status: 'DRAFT', controls: { ...controls, notAControl: 'dropped' } };

    // Declared fields pass; an undeclared one is still stripped, as the new fields were before.
    assert.deepEqual(parse(create, args).data.controls, controls);
    // Clients that stringify complex params get the same result.
    assert.deepEqual(parse(create, { ...args, controls: JSON.stringify(args.controls) }).data.controls, controls);

    const { workspaceId, ...rest } = parse(create, { ...args, ...(ws ? { workspaceId: ws } : {}) }).data;
    await create.run(port, rest, workspaceId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'createPosts');
    assert.deepEqual(calls[0].args[0].controls, controls);
    assert.equal(calls[0].args[1], ws);

    // The REST input caps the language at 35 characters.
    assert.equal(parse(create, { ...args, controls: { youtubeLanguage: 'x'.repeat(35) } }).success, true);
    assert.equal(parse(create, { ...args, controls: { youtubeLanguage: 'x'.repeat(36) } }).success, false);
    // A caption never rides in mediaItems: their type is IMAGE or VIDEO only.
    const asMedia = { ...post, mediaItems: [{ key: CAPTION_KEY, type: 'CAPTION', sortOrder: 0 }] };
    assert.equal(parse(create, { ...args, posts: [asMedia] }).success, false);
  });

  test(`${binding}: the language and caption descriptions state the backend's rules`, async () => {
    const tools = await listed(binding);
    const props = tool(tools, 'create_posts').inputSchema.properties.controls.properties;
    const keys = Object.keys(props);
    // In the YouTube block, right after the thumbnail.
    assert.deepEqual(keys.slice(keys.indexOf('youtubeThumbnailKey'), keys.indexOf('youtubeThumbnailKey') + 4), [
      'youtubeThumbnailKey',
      'youtubeLanguage',
      'youtubeCaptionKey',
      'facebookContentType',
    ]);

    const language = props.youtubeLanguage;
    assert.equal(language.type, 'string');
    assert.equal(language.maxLength, 35);
    for (const code of ['en', 'en-GB', 'es', 'es-419', 'fr', 'fr-CA', 'pt-BR', 'zh-Hans']) {
      assert.match(language.description, new RegExp(`[ ,]${code}[ ,.]`), code);
    }
    for (const pattern of [
      /BCP-47/,
      /Video language \(what is spoken\)/,
      /Title and description language/,
      /is the language of the youtubeCaptionKey captions/,
      /rejected with HTTP 400 "youtubeLanguage\.invalid"/,
      /Used only by YouTube posts; applies to every post in this call, so put videos in different languages in separate calls/,
    ]) {
      assert.match(language.description, pattern);
    }

    const caption = props.youtubeCaptionKey;
    assert.equal(caption.type, 'string');
    for (const pattern of [
      /file\/<uuid>\.srt or \.vtt/,
      /Upload the file before this call, and never put its key in mediaItems/,
      /in the language set by youtubeLanguage, which is required with it \(otherwise HTTP 400 "youtubeCaptionKey\.languageRequired"\)/,
      /one caption track per post/,
      /timed SRT or WebVTT file .*plain UTF-8 text, at most 10 MB; a transcript without timings doesn't work/,
      /YouTube's automatic captions stay listed separately as "\(auto-generated\)"/,
      /If adding the captions fails, the video still publishes, without them/,
      /each video with its own caption file needs its own create_posts call/,
    ]) {
      assert.match(caption.description, pattern);
    }
    for (const mime of CAPTION_MIME_TYPES) assert.ok(caption.description.includes(mime), mime);
    // It names this surface's upload tools, and no other surface's.
    for (const name of UPLOAD_TOOLS[binding]) assert.ok(caption.description.includes(name), name);
    const elsewhere = binding === 'stdio' ? 'upload_from_url' : 'get_upload_urls';
    assert.ok(!caption.description.includes(elsewhere), elsewhere);
    assert.ok(caption.description.includes(binding === 'stdio' ? 'the key (' : 'the media_id ('));

    const youtubeLine = instructionsFor(binding).split('\n').find((line) => line.startsWith('- YouTube: controls.'));
    assert.match(youtubeLine, /youtubeCaptionKey/);
    for (const text of [language.description, caption.description, youtubeLine]) {
      for (const [claim, pattern] of Object.entries(NEVER)) {
        assert.doesNotMatch(text, pattern, claim);
      }
    }
  });

  test(`${binding}: the upload tools take caption files and say where a CAPTION key goes`, async () => {
    const tools = await listed(binding);
    const where = /controls\.youtubeCaptionKey(?: instead)?, never in mediaItems/;
    for (const name of UPLOAD_TOOLS[binding]) {
      const t = tool(tools, name);
      const text = [t.description, ...Object.values(t.inputSchema.properties).map((p) => p.description)].join('\n');
      assert.match(t.description, where, name);
      assert.match(text, /\.srt/, name);
      assert.match(text, /\.vtt/, name);
      // upload_media on stdio reads a local file, so it takes no MIME type.
      if (!(binding === 'stdio' && name === 'upload_media')) {
        for (const mime of CAPTION_MIME_TYPES) assert.ok(text.includes(mime), `${name}: ${mime}`);
      }
      if (name !== 'get_upload_urls') assert.match(t.description, /CAPTION/, name);
    }
    if (binding === 'stdio') {
      const urls = tool(tools, 'get_upload_urls').inputSchema.properties;
      assert.equal(urls.count.description, 'Number of upload URLs (1-8 for images, 1 for videos, caption files and documents)');
    } else {
      for (const name of ['upload_media', 'upload_from_url']) {
        const contentType = tool(tools, name).inputSchema.properties.contentType.description;
        assert.match(contentType, /application\/x-subrip for (?:an )?\.srt/, name);
        assert.match(contentType, /text\/vtt for (?:a )?\.vtt/, name);
      }
      // A share page would be stored as the caption, since the model sets the type itself.
      assert.match(tool(tools, 'upload_from_url').description, /For a caption file or a document, link to the file itself; a share page doesn't work\./);
    }
  });
}

test('the YouTube line of the instructions names both controls, the same on both bindings', () => {
  const lines = ['stdio', 'remote'].map((binding) =>
    instructionsFor(binding).split('\n').find((line) => line.startsWith('- YouTube: controls.')),
  );
  assert.equal(lines[0], lines[1]);
  assert.match(lines[0], /youtubeLanguage sets the video's language \(BCP-47, e\.g\. en-GB\)/);
  assert.match(lines[0], /youtubeCaptionKey adds an uploaded \.srt\/\.vtt caption file in that language \(never in mediaItems\)/);
});

test('the never-say patterns catch the claims they exist for', () => {
  const bad = {
    'captions replace or remove auto-captions': 'Your captions replace the auto-generated ones.',
    'several caption tracks per video': 'Add several caption tracks, one per language.',
    'captions can be changed after publishing': 'You can update the captions after the video publishes.',
    'untimed transcripts work': 'A plain transcript without timings works too.',
  };
  for (const [claim, sentence] of Object.entries(bad)) assert.match(sentence, NEVER[claim], claim);
  // Saying the opposite is fine.
  assert.doesNotMatch("a transcript without timings doesn't work", NEVER['untimed transcripts work']);
});

test('uploadTypeFor: images and videos for mediaItems, .srt and .vtt as CAPTION', () => {
  const cases = {
    'image/png': 'IMAGE',
    'image/webp': 'IMAGE',
    'video/mp4': 'VIDEO',
    'video/quicktime': 'VIDEO',
    'application/x-subrip': 'CAPTION',
    'text/vtt': 'CAPTION',
    'text/vtt; charset=utf-8': 'CAPTION',
    ' Application/X-SubRip ': 'CAPTION',
    'text/plain': undefined,
    'application/zip': undefined,
    'application/octet-stream': undefined,
    '': undefined,
  };
  for (const [mime, type] of Object.entries(cases)) assert.equal(uploadTypeFor(mime), type, mime);
  assert.deepEqual([...CAPTION_MIME_TYPES], ['application/x-subrip', 'text/vtt']);
});

test('remote upload_media hands a 100 KB caption file to the port byte for byte', async () => {
  // A long SRT with text in several scripts, so any re-encoding would show.
  const lines = ['¿Qué tal? Hoy es 3 de octubre.', 'Até amanhã, às 18h30!', 'Днес е 3 октомври.', '今日は10月3日です。'];
  const time = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},000`;
  const cues = [];
  for (let i = 0, bytes = 0; bytes < 100_000; i += 1) {
    cues.push(`${i + 1}\r\n${time(i * 2)} --> ${time(i * 2 + 2)}\r\n${lines[i % lines.length]}\r\n\r\n`);
    bytes += Buffer.byteLength(cues[i]);
  }
  const srt = cues.join('');
  const data = Buffer.from(srt, 'utf8').toString('base64');
  assert.ok(data.length > 130_000, `${data.length} base64 characters`);

  const uploaded = { media_id: CAPTION_KEY, type: 'CAPTION' };
  const { port, calls } = recordingPort(uploaded);
  const { client, close } = await connect('remote', port);
  const result = await client.callTool({
    name: 'upload_media',
    arguments: { data, contentType: 'application/x-subrip', workspaceId: WS },
  });
  await close();

  assert.ok(!result.isError, JSON.stringify(result.content));
  assert.deepEqual(result.structuredContent, uploaded);
  assert.equal(calls.length, 1);
  const [{ method, args: [args, workspaceId] }] = calls;
  assert.equal(method, 'uploadMedia');
  assert.equal(workspaceId, WS);
  assert.deepEqual(Object.keys(args).sort(), ['contentType', 'data']);
  assert.equal(args.contentType, 'application/x-subrip');
  assert.equal(Buffer.from(args.data, 'base64').toString('utf8'), srt);
});
