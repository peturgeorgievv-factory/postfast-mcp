import { PLATFORM_PATHS } from './platform-icons';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Interface glyphs: Lucide icons (ISC license), 24x24, stroked with
 * currentColor. `play` is filled.
 */
const GLYPHS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  external:
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  alert:
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  calendar:
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  text: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  userPlus:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  layers:
    '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  expand:
    '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>',
  spinner: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
} as const;

export type GlyphName = keyof typeof GLYPHS;

/** An inline Lucide glyph, hidden from assistive tech (its button carries the label). */
export function glyph(name: GlyphName, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  if (name === 'play') {
    svg.setAttribute('fill', 'currentColor');
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  svg.innerHTML = GLYPHS[name];
  return svg;
}

const PLATFORM_NAMES: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  X: 'X',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
  BLUESKY: 'Bluesky',
  THREADS: 'Threads',
  PINTEREST: 'Pinterest',
  TELEGRAM: 'Telegram',
  GOOGLE_BUSINESS_PROFILE: 'Google Business Profile',
};

export const platformName = (platform: string): string => PLATFORM_NAMES[platform] ?? platform;

/** A platform's glyph, coloured by its `data-platform` rule in the stylesheet. */
export function platformGlyph(platform: string, className = 'platform-glyph'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  svg.setAttribute('data-platform', platform);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', PLATFORM_PATHS[platform] ?? '');
  svg.append(path);
  if (!PLATFORM_PATHS[platform]) {
    // Unknown platform: a plain circle, never an empty box.
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '9');
    circle.setAttribute('fill', 'currentColor');
    svg.append(circle);
  }
  return svg;
}

/** The PostFast mark: blue blocks and connectors, the two dark pieces in the text colour. */
export function logoMark(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 512 512');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'logo-mark');
  svg.innerHTML =
    '<g fill="#2563EB">' +
    '<rect x="19" y="14" width="108" height="108"/><rect x="387" y="14" width="108" height="108"/>' +
    '<rect x="19" y="198" width="108" height="108"/><rect x="203" y="198" width="108" height="108"/>' +
    '<rect x="19" y="382" width="108" height="108"/><rect x="387" y="382" width="108" height="108"/>' +
    '<rect x="229" y="40" width="56" height="56"/><rect x="127" y="51" width="260" height="34"/>' +
    '<rect x="239" y="96" width="34" height="102"/><rect x="55" y="122" width="34" height="76"/>' +
    '<rect x="55" y="306" width="34" height="76"/><rect x="127" y="235" width="76" height="34"/>' +
    '</g><g fill="currentColor">' +
    '<rect x="337" y="235" width="67" height="34"/><rect x="404" y="215" width="74" height="74"/>' +
    '<rect x="240" y="342" width="34" height="57"/><rect x="220" y="399" width="74" height="74"/>' +
    '</g>';
  return svg;
}
