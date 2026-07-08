/** Coerce a possibly-NaN/Infinity number-input value to a finite fallback. */
export const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

/** Clamp a value to a minimum, substituting `fallback` when not finite. Used
 *  by number inputs / sliders that should not round their value. */
export const clampMin = (value: number, min: number, fallback: number): number =>
  Math.max(min, finiteOr(value, fallback));

/** Round a value and clamp it to [min, max], substituting `min` when not finite. */
export const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(finiteOr(value, min))));
