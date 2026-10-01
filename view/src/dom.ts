export type Child = Node | string | number | null | undefined | false;

type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/**
 * Builds an element. Strings become text nodes, so post captions, handles and
 * error messages are never parsed as HTML. `on*` attributes that hold a
 * function become listeners; false, null and undefined attributes are left out.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (typeof value === 'function') {
      el.addEventListener(name.slice(2), value);
    } else if (name === 'class') {
      el.className = String(value);
    } else {
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }
  append(el, ...children);
  return el;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** An http(s) URL safe to load or open, or null. http is accepted only on loopback hosts. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return url.href;
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return url.href;
    }
  } catch {
    // not a URL
  }
  return null;
}
