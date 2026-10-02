// The calendar view's date, time-zone and URL helpers, imported from their
// TypeScript source (Node strips the types; needs Node 22.18 or later).
// Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateToWallTime,
  dayKey,
  daysBetween,
  dayTitle,
  formatPostTime,
  parseDate,
  resolveLocale,
  resolveTimeZone,
  wallTimeToDate,
} from '../view/src/format.ts';
import { safeUrl } from '../view/src/dom.ts';

const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

test('time zone: the host zone when valid, else the browser zone', () => {
  assert.equal(resolveTimeZone('Europe/Sofia'), 'Europe/Sofia');
  assert.equal(resolveTimeZone('America/Los_Angeles'), 'America/Los_Angeles');
  assert.equal(resolveTimeZone('Mars/Olympus_Mons'), browserZone);
  assert.equal(resolveTimeZone(''), browserZone);
  assert.equal(resolveTimeZone(undefined), browserZone);
});

test('locale: English in the host region, en-GB otherwise', () => {
  assert.equal(resolveLocale('en-US'), 'en-US');
  assert.equal(resolveLocale('en-GB'), 'en-GB');
  assert.equal(resolveLocale('bg-BG'), 'en-GB');
  assert.equal(resolveLocale('es'), 'en-GB');
  assert.equal(resolveLocale(undefined), 'en-GB');
});

test('dayKey puts an instant on the day of the given zone', () => {
  const late = new Date('2026-10-01T22:30:00Z');
  assert.equal(dayKey(late, 'UTC'), '2026-10-01');
  assert.equal(dayKey(late, 'Europe/Sofia'), '2026-10-02'); // UTC+3 in summer time
  assert.equal(dayKey(late, 'America/Los_Angeles'), '2026-10-01');
  assert.equal(dayKey(new Date('2026-10-01T10:00:00Z'), 'Pacific/Kiritimati'), '2026-10-02'); // UTC+14
});

test('daysBetween counts calendar days, across month ends and DST changes', () => {
  assert.equal(daysBetween('2026-09-30', '2026-10-02'), 2);
  assert.equal(daysBetween('2026-10-02', '2026-09-30'), -2);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});

test('day headings: relative words near today, the date otherwise', () => {
  const today = '2026-10-01';
  assert.equal(dayTitle(today, today, 'en-GB').title, 'Today');
  assert.match(dayTitle(today, today, 'en-GB').subtitle, /Thursday.*1.*October/);
  assert.equal(dayTitle('2026-10-02', today, 'en-GB').title, 'Tomorrow');
  assert.equal(dayTitle('2026-09-30', today, 'en-GB').title, 'Yesterday');
  const later = dayTitle('2026-10-05', today, 'en-GB');
  assert.match(later.title, /Monday.*5.*October/);
  assert.equal(later.subtitle, undefined);
});

test('post times read "Thu 1 Oct, 09:00" in the viewer zone', () => {
  const at = new Date('2026-10-01T06:00:00Z');
  assert.equal(formatPostTime(at, 'Europe/Sofia', 'en-GB'), 'Thu 1 Oct, 09:00');
  assert.equal(formatPostTime(at, 'UTC', 'en-GB'), 'Thu 1 Oct, 06:00');
  assert.match(formatPostTime(at, 'America/New_York', 'en-US'), /Thu.*Oct.*1.*02:00/);
});

test('wall times convert to the exact instant in the chosen zone', () => {
  assert.equal(wallTimeToDate('2026-10-01T09:00', 'Europe/Sofia').toISOString(), '2026-10-01T06:00:00.000Z');
  assert.equal(wallTimeToDate('2026-12-01T09:00', 'Europe/Sofia').toISOString(), '2026-12-01T07:00:00.000Z');
  assert.equal(wallTimeToDate('2026-10-01T09:00', 'America/Los_Angeles').toISOString(), '2026-10-01T16:00:00.000Z');
  assert.equal(wallTimeToDate('2026-10-01T09:00', 'UTC').toISOString(), '2026-10-01T09:00:00.000Z');
  // Round trip.
  for (const wall of ['2026-10-01T09:00', '2026-03-29T12:30', '2027-01-15T00:05']) {
    assert.equal(dateToWallTime(wallTimeToDate(wall, 'Europe/Sofia'), 'Europe/Sofia'), wall);
  }
});

test('wall times next to a DST change still resolve to a real instant', () => {
  // Sofia falls back 04:00 -> 03:00 on 2026-10-25: 03:30 happens twice.
  const repeated = wallTimeToDate('2026-10-25T03:30', 'Europe/Sofia');
  assert.equal(dateToWallTime(repeated, 'Europe/Sofia'), '2026-10-25T03:30');
  // Sofia springs forward 03:00 -> 04:00 on 2026-03-29: 03:30 never happens.
  const skipped = wallTimeToDate('2026-03-29T03:30', 'Europe/Sofia');
  assert.ok(skipped instanceof Date && !Number.isNaN(skipped.getTime()));
  assert.ok(['2026-03-29T02:30', '2026-03-29T04:30'].includes(dateToWallTime(skipped, 'Europe/Sofia')));
});

test('malformed or out-of-range wall times are rejected', () => {
  for (const wall of ['', '2026-10-01', '09:00', 'soon', '2026-13-01T09:00', '2026-02-30T09:00', '2026-10-01T24:00', '2026-10-01T09:60']) {
    assert.equal(wallTimeToDate(wall, 'Europe/Sofia'), null, wall);
  }
  assert.ok(wallTimeToDate('2028-02-29T09:00', 'UTC'), 'leap day');
});

test('parseDate accepts ISO strings only', () => {
  assert.equal(parseDate('2026-10-01T06:00:00.000Z').toISOString(), '2026-10-01T06:00:00.000Z');
  for (const value of [null, undefined, '', 'not a date']) assert.equal(parseDate(value), null);
});

test('safeUrl allows https, and http only on loopback', () => {
  assert.equal(safeUrl('https://app.postfa.st/dashboard/posts?editPostId=1'), 'https://app.postfa.st/dashboard/posts?editPostId=1');
  assert.equal(safeUrl('http://localhost:3002/a.jpg'), 'http://localhost:3002/a.jpg');
  assert.equal(safeUrl('http://127.0.0.1/x'), 'http://127.0.0.1/x');
  for (const value of ['http://example.com/', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://x', '/relative', '', null, 42]) {
    assert.equal(safeUrl(value), null, String(value));
  }
});

const { matchesSearch, normalizeSearch } = await import('../view/src/search.ts');

test('search: lowercase, no accents, single spaces; other scripts kept', () => {
  assert.equal(normalizeSearch('  Café   Crème '), 'cafe creme');
  assert.equal(normalizeSearch('Петър  Георгиев'), 'петър георгиев');
  assert.equal(normalizeSearch('ŁÓDŹ'), 'łodz');
});

test('search: every word must appear, in any order, across the text', () => {
  const account = '@kohifit kohifit Instagram';
  assert.equal(matchesSearch(account, ''), true);
  assert.equal(matchesSearch(account, '   '), true);
  assert.equal(matchesSearch(account, 'KOHI'), true);
  assert.equal(matchesSearch(account, '@kohi'), true);
  assert.equal(matchesSearch(account, 'instagram kohi'), true);
  assert.equal(matchesSearch(account, 'kohi tiktok'), false);
  assert.equal(matchesSearch('Петър Георгиев Google Business Profile', 'петър'), true);
  assert.equal(matchesSearch('Lopema Real Estate', 'lopéma'), true);
});
