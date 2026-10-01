const DAY_MS = 86_400_000;

/** The host's IANA time zone when it is valid, else the browser's. */
export function resolveTimeZone(candidate?: string): string {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (!candidate) return fallback;
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate });
    return candidate;
  } catch {
    return fallback;
  }
}

/**
 * The copy is English, so dates use English in the host's regional order
 * (en-US, en-GB, …) and en-GB for any other language.
 */
export function resolveLocale(candidate?: string): string {
  if (candidate && /^en(-|$)/i.test(candidate)) {
    try {
      return new Intl.DateTimeFormat(candidate).resolvedOptions().locale;
    } catch {
      // fall through
    }
  }
  return 'en-GB';
}

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

type Parts = Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;

const partFormatters = new Map<string, Intl.DateTimeFormat>();

/** An instant's wall-clock fields in a time zone. */
function zonedParts(date: Date, timeZone: string): Parts {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partFormatters.set(timeZone, formatter);
  }
  const parts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const { type, value } of formatter.formatToParts(date)) {
    if (type in parts) parts[type as keyof Parts] = Number(value);
  }
  return parts;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar day of an instant in a time zone, as YYYY-MM-DD. */
export function dayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Whole days from one YYYY-MM-DD to another. */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

/** A day heading: "Today" with the date beside it, or the date alone. */
export function dayTitle(
  key: string,
  todayKey: string,
  locale: string,
): { title: string; subtitle?: string } {
  const full = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${key}T12:00:00Z`));
  const diff = daysBetween(todayKey, key);
  const relative = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : undefined;
  return relative ? { title: relative, subtitle: full } : { title: full };
}

/** "Wed 1 Oct, 09:00" (in the host's regional order) in a time zone. */
export function formatPostTime(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(date);
}

/** Minutes a time zone is ahead of UTC at an instant. */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/**
 * The instant of a wall-clock time ("2026-10-01T09:00", as a datetime-local
 * input gives it) in a time zone; null when malformed. A second pass settles
 * times next to a daylight-saving change.
 */
export function wallTimeToDate(wall: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(wall);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  // Date.UTC would roll an out-of-range field into the next one; reject it.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59) {
    return null;
  }
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMinutes(new Date(guess), timeZone);
  let instant = guess - first * 60_000;
  const second = offsetMinutes(new Date(instant), timeZone);
  if (second !== first) instant = guess - second * 60_000;
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** An instant as a datetime-local value in a time zone. */
export function dateToWallTime(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
