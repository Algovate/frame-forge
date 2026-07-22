import { describe, expect, it } from 'vitest';
import { clientPointToSourcePixel, createGridBoundaries, moveGridBoundary } from './gridGuides';

describe('grid guides', () => {
  it('creates pixel-safe equal boundaries', () => {
    expect(createGridBoundaries(100, 3)).toEqual([0, 33, 67, 100]);
    expect(createGridBoundaries(1, 20)).toEqual([0, 1]);
  });

  it('keeps a pixel on both sides of an adjusted guide', () => {
    expect(moveGridBoundary([0, 30, 100], 1, 99)).toEqual([0, 99, 100]);
    expect(moveGridBoundary([0, 30, 100], 1, -2)).toEqual([0, 1, 100]);
    expect(moveGridBoundary([0, 30, 100], 0, 50)).toEqual([0, 30, 100]);
  });

  it('maps coordinates from a scaled overlay exactly once', () => {
    expect(clientPointToSourcePixel(110, { left: 10, top: 0, width: 200, height: 100 }, 400)).toBe(200);
  });
});
