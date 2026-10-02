/**
 * A colour's numbers: its red, green and blue, and where it sits in CIELAB, the space in which a
 * distance is how different two colours look. DOM-free, so the tests can measure with it.
 */

/** A colour as its red, green and blue, each from 0 to `CHANNEL_MAX`. */
export type Rgb = [number, number, number];
/** A colour in CIELAB: its lightness, then its green to red and blue to yellow axes. */
type Lab = [number, number, number];

export const CHANNEL_MAX = 255;

/** A `#rrggbb` colour's red, green and blue. */
export function rgbOf(color: string): Rgb {
  return [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16)) as Rgb;
}

/** Red, green and blue as a `#rrggbb` colour in lower case. */
export function hexOf(rgb: Rgb): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** A `#rrggbb` colour in CIELAB, from sRGB under the D65 white, as the CIE defines it. */
function lab(color: string): Lab {
  const [r, g, b] = rgbOf(color).map((v) => {
    const s = v / CHANNEL_MAX;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * A `#rrggbb` colour as a person would describe it, from CIELAB: its lightness, 0 to 100; its
 * chroma, how far from grey, 0 for a grey; and its hue, the angle round the colour wheel in
 * degrees, from red through yellow, green and blue.
 */
export function lch(color: string): { lightness: number; chroma: number; hue: number } {
  const [lightness, a, b] = lab(color);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return { lightness, chroma: Math.hypot(a, b), hue: hue < 0 ? hue + 360 : hue };
}

/**
 * How different two `#rrggbb` colours look: their distance apart in CIELAB (CIE76 ΔE). About 2 is
 * the least a person notices side by side.
 */
export function colorDifference(a: string, b: string): number {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
