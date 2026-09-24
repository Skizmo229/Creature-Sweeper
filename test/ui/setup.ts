/**
 * What happy-dom lacks and the UI needs: a 2D canvas context (any method may be called, nothing is
 * drawn, text measures as a plausible box), the font set, and an animation frame. Imported by
 * every test under test/ui/; those files run in the happy-dom environment and are excluded from the
 * no-DOM typecheck pass on purpose.
 */

const noopContext = (): CanvasRenderingContext2D =>
  new Proxy({} as CanvasRenderingContext2D, {
    get(_target, prop) {
      if (prop === 'measureText') {
        return (text: string) => ({
          width: text.length * 8,
          actualBoundingBoxAscent: 7,
          actualBoundingBoxDescent: 2,
        });
      }
      if (prop === 'canvas') return document.createElement('canvas');
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set() {
      return true;
    },
  });

HTMLCanvasElement.prototype.getContext = function () {
  return noopContext();
} as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toDataURL = () => 'data:,';

if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    value: {
      check: () => true,
      load: () => Promise.resolve([]),
      ready: Promise.resolve(),
    },
  });
}

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number): void => clearTimeout(id);
}
