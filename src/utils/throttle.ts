/** Leading-edge time-gate throttle: the first call runs immediately, and any
 *  further calls within `intervalMs` are dropped (the next one that lands after
 *  the window re-opens runs). Intended for high-frequency progress callbacks
 *  (e.g. per-frame extraction/matting updates) that would otherwise trigger an
 *  O(N) re-render on every frame.
 *
 *  Trailing calls inside a window are dropped by design — callers must still
 *  commit the final state themselves once the loop finishes, since the last
 *  update may fall inside a closed window. */
export const createThrottle = (intervalMs: number): ((fn: () => void) => void) => {
  let last = 0;
  return (fn: () => void) => {
    const now = performance.now();
    if (now - last >= intervalMs) {
      last = now;
      fn();
    }
  };
};
