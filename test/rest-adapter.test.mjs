// The stdio REST adapter over a stubbed fetch: what reaches the PostFast API
// for the post filters, the bulk delete and local uploads, and how an API
// error reads. Run with `npm test`.
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RestAdapter } from '../dist/stdio/rest-adapter.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const realFetch = globalThis.fetch;

let requests;
let reply;
const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });

beforeEach(() => {
  process.env.POSTFAST_API_KEY = 'pf-test-key';
  process.env.POSTFAST_API_URL = 'https://api.example.test/';
  requests = [];
  reply = () => json({});
  globalThis.fetch = async (url, init) => {
    requests.push({
      url: String(url),
      method: init.method,
      key: init.headers['pf-api-key'],
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    });
    return reply();
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('listPosts sends the account filter as a comma-separated query param', async () => {
  const api = new RestAdapter();
  await api.listPosts({ page: 0, limit: 20, socialMediaIds: [A, B], statuses: ['SCHEDULED'] });
  await api.listPosts({ page: 1, limit: 5 });
  const [filtered, plain] = requests.map((r) => new URL(r.url));
  assert.equal(requests[0].method, 'GET');
  assert.equal(filtered.origin + filtered.pathname, 'https://api.example.test/social-posts');
  assert.deepEqual(Object.fromEntries(filtered.searchParams), {
    page: '0',
    limit: '20',
    socialMediaIds: `${A},${B}`,
    statuses: 'SCHEDULED',
  });
  assert.deepEqual(Object.fromEntries(plain.searchParams), { page: '1', limit: '5' });
});

test('deletePosts posts the ids to /social-posts/bulk-delete and returns the response', async () => {
  reply = () => json({ deletedIds: [A], notFoundIds: [B] });
  const out = await new RestAdapter().deletePosts([A, B]);
  assert.deepEqual(requests, [
    {
      url: 'https://api.example.test/social-posts/bulk-delete',
      method: 'POST',
      key: 'pf-test-key',
      body: { ids: [A, B] },
    },
  ]);
  assert.deepEqual(out, { deletedIds: [A], notFoundIds: [B] });
});

test('a 429 error ends with the Retry-After delay when the API sends one', async () => {
  const limited = { statusCode: 429, message: 'Too many requests. Please try again later.', error: 'Too Many Requests' };
  const api = new RestAdapter();

  reply = () => json(limited, { status: 429, headers: { 'Retry-After': '37', 'Retry-After-long': '37' } });
  await assert.rejects(api.deletePosts([A]), {
    message: 'PostFast API error (429): Too many requests. Please try again later. Retry after 37s.',
  });

  // No header, or a value that is not a delay in seconds: the message is as before.
  for (const headers of [{}, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }]) {
    reply = () => json(limited, { status: 429, headers });
    await assert.rejects(api.listPosts({ page: 0, limit: 20 }), {
      message: 'PostFast API error (429): Too many requests. Please try again later.',
    });
  }

  // Only a 429 gets the hint.
  reply = () => json({ message: 'Each id must be a valid UUID' }, { status: 400, headers: { 'Retry-After': '37' } });
  await assert.rejects(api.deletePosts([A]), {
    message: 'PostFast API error (400): Each id must be a valid UUID',
  });
});

test('uploadLocalFile sends .srt and .vtt files as captions and returns type CAPTION', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'postfast-upload-'));
  const files = {
    'talk.srt': ['application/x-subrip', 'CAPTION', '1\r\n00:00:01,000 --> 00:00:03,500\r\nHoy es 3 de octubre.\r\n'],
    'talk.VTT': ['text/vtt', 'CAPTION', 'WEBVTT\n\n00:01.000 --> 00:03.500\nAté amanhã!\n'],
    // Controls: images and videos classify as before.
    'photo.PNG': ['image/png', 'IMAGE', 'png-bytes'],
    'clip.mov': ['video/quicktime', 'VIDEO', 'mov-bytes'],
  };
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
    return String(url).startsWith('https://api.example.test/')
      ? json([{ key: `file/${A}.srt`, signedUrl: 'https://r2.example.test/put?sig=1' }])
      : new Response(null, { status: 200 });
  };
  const api = new RestAdapter();

  for (const [name, [contentType, type, text]] of Object.entries(files)) {
    sent.length = 0;
    const path = join(dir, name);
    writeFileSync(path, text);
    assert.deepEqual(await api.uploadLocalFile(path), { key: `file/${A}.srt`, type, contentType }, name);
    const [mint, put] = sent;
    assert.equal(sent.length, 2, name);
    assert.deepEqual(
      [mint.url, mint.method, mint.headers['pf-api-key'], JSON.parse(mint.body)],
      ['https://api.example.test/file/get-signed-upload-urls', 'POST', 'pf-test-key', { contentType, count: 1 }],
      name,
    );
    // The file goes to the signed URL as is, typed, and without the API key.
    assert.deepEqual([put.url, put.method, put.headers], ['https://r2.example.test/put?sig=1', 'PUT', { 'Content-Type': contentType }], name);
    assert.equal(Buffer.from(put.body).toString('utf8'), text, name);
  }

  // Anything else is refused before any request, and the message lists the caption extensions.
  sent.length = 0;
  writeFileSync(join(dir, 'notes.txt'), 'plain transcript');
  await assert.rejects(api.uploadLocalFile(join(dir, 'notes.txt')), {
    message: 'Unsupported file extension ".txt". Supported: .jpg, .jpeg, .png, .gif, .webp, .mp4, .webm, .mov, .srt, .vtt',
  });
  assert.equal(sent.length, 0);
});

test("an error carries the API's reason after its code", async () => {
  const api = new RestAdapter();
  const invalid = {
    statusCode: 400,
    message: 'media.invalidMedia',
    error: 'BAD_REQUEST',
    description: `Invalid media files: file/${A}.srt (not a timed UTF-8 SRT or WebVTT file)`,
  };
  reply = () => json(invalid, { status: 400 });
  await assert.rejects(api.createPosts({ posts: [], status: 'DRAFT', approvalStatus: 'APPROVED' }), {
    message: `PostFast API error (400): media.invalidMedia — Invalid media files: file/${A}.srt (not a timed UTF-8 SRT or WebVTT file)`,
  });

  // The 429 hint still comes last.
  reply = () => json({ ...invalid, statusCode: 429, message: 'throttle.tooManyRequests', description: 'Slow down.' }, { status: 429, headers: { 'Retry-After': '5' } });
  await assert.rejects(api.listPosts({ page: 0, limit: 20 }), {
    message: 'PostFast API error (429): throttle.tooManyRequests — Slow down. Retry after 5s.',
  });

  // A reason equal to the message, an empty one or a non-string one adds nothing.
  for (const description of ['media.invalidMedia', '', { nested: true }]) {
    reply = () => json({ ...invalid, description }, { status: 400 });
    await assert.rejects(api.deletePosts([A]), { message: 'PostFast API error (400): media.invalidMedia' });
  }
});
