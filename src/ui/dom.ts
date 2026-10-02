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

/** A card built to go up as the modal overlay, and the control to focus when it does. */
export interface OverlayCard {
  overlay: HTMLElement;
  focus: HTMLElement;
}
