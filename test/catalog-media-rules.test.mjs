// The media rules the catalog states, checked on every surface against each
// other and against the backend's validation: which platforms reject a post
// without media (drafts included) and the per-post cap. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTools, instructionsFor } from '../dist/core/index.js';

const MEDIA_REQUIRED = ['Instagram', 'Pinterest', 'TikTok', 'YouTube'];
const MAX_MEDIA_ITEMS = 10;
const SURFACES = {
  stdio: [buildTools({ binding: 'stdio' }), instructionsFor('stdio')],
  remote: [
    buildTools({
      binding: 'remote',
      withWorkspaceField: true,
      confirmGate: { secret: 'catalog-media-rules-test-secret-32' },
    }),
    instructionsFor('remote'),
  ],
};
const SKILL_FILES = [
  'skills/social-media-post/SKILL.md',
  'plugins/postfast/skills/schedule-posts/references/platform-rules.md',
];

/** "TikTok, YouTube (video only), Instagram, and Pinterest" -> sorted names. */
const platformList = (text) =>
  text
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((name) => name.replace(/\s*\([^)]*\)/g, '').trim())
    .filter(Boolean)
    .sort();

/** Every count of media on one post that a text states. */
const mediaCounts = (text) => [
  ...[...text.matchAll(/(\d+) images? \+ (\d+) videos?/g)].map(([, a, b]) => Number(a) + Number(b)),
  ...[...text.matchAll(/up to (\d+) (?:images|photos|media items|items)/g)].map(([, n]) => Number(n)),
];

for (const [surface, [tools, instructions]] of Object.entries(SURFACES)) {
  const createPosts = tools.find((t) => t.name === 'create_posts').description;

  test(`${surface}: create_posts and the instructions name the same media-required platforms`, () => {
    const fromTool = /\. ([^.]*?) require at least one media item EVEN FOR DRAFTS/.exec(createPosts)?.[1];
    const fromInstructions = /Media is REQUIRED on ([^;]*);/.exec(instructions)?.[1];
    assert.deepEqual(platformList(fromTool ?? ''), MEDIA_REQUIRED);
    assert.deepEqual(platformList(fromInstructions ?? ''), MEDIA_REQUIRED);
  });

  test(`${surface}: no stated media count exceeds ${MAX_MEDIA_ITEMS} items per post`, () => {
    const counts = mediaCounts(`${instructions}\n${createPosts}`);
    assert.ok(counts.length > 0);
    assert.deepEqual(counts.filter((n) => n > MAX_MEDIA_ITEMS), []);
  });
}

test('the skills state no media count above the per-post cap', () => {
  for (const file of SKILL_FILES) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.deepEqual(mediaCounts(text).filter((n) => n > MAX_MEDIA_ITEMS), [], file);
  }
});
