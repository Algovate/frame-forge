import { describe, expect, it } from 'vitest';
import { clampPixelRect, colorToHex, displayCropToPixelRect, isPointInBounds } from './canvasEditor';

describe('displayCropToPixelRect', () => {
  it('converts scaled display crop values to source pixels', () => {
    expect(displayCropToPixelRect({ x: 20, y: 10, width: 100, height: 50 }, 0.5, 400, 200)).toEqual({
      x: 40,
      y: 20,
      width: 200,
      height: 100,
    });
  });

  it('clamps crop values to image bounds', () => {
    expect(clampPixelRect({ x: -5, y: 10, width: 500, height: 300 }, 100, 80)).toEqual({
      x: 0,
      y: 10,
      width: 100,
      height: 70,
    });
  });
});

describe('isPointInBounds', () => {
  it('detects points outside the canvas', () => {
    expect(isPointInBounds({ x: 0, y: 0 }, 10, 10)).toBe(true);
    expect(isPointInBounds({ x: 9.99, y: 9.99 }, 10, 10)).toBe(true);
    expect(isPointInBounds({ x: 10, y: 0 }, 10, 10)).toBe(false);
    expect(isPointInBounds({ x: -1, y: 0 }, 10, 10)).toBe(false);
  });
});

describe('colorToHex', () => {
  it('converts RGB channels to a hex color', () => {
    expect(colorToHex({ r: 12, g: 128, b: 255, a: 77 })).toBe('#0c80ff');
  });
});
