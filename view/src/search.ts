/** Lowercase, without accents or extra spaces, for matching what people type against names. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when every word of the query appears somewhere in the text, in any order. */
export function matchesSearch(text: string, query: string): boolean {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeSearch(text);
  return words.every((word) => haystack.includes(word));
}
