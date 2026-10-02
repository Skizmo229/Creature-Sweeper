/** The DOM helpers the UI shares. */

/** An element with an optional class and text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A link that leaves the game in a tab of its own: on itch.io the game runs in a frame, and the
 * pages it links to will not load inside one.
 */
export function link(href: string, text: string): HTMLAnchorElement {
  const a = el('a', undefined, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** A card built to go up as the modal overlay, and the control to focus when it does. */
export interface OverlayCard {
  overlay: HTMLElement;
  focus: HTMLElement;
}
