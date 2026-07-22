import { describe, expect, it } from 'vitest';
import { createGridRects, normalizeGridAxisBoundaries, normalizeGridSplitOptions } from './gridExtractor';

describe('normalizeGridSplitOptions', () => {
  it('keeps grid settings inside practical bounds', () => {
    expect(normalizeGridSplitOptions({ rows: 0, cols: 99, padding: -5 })).toEqual({
      rows: 1,
      cols: 20,
      padding: 0,
    });
  });
});

describe('createGridRects', () => {
  it('creates row-major cell rectangles', () => {
    expect(createGridRects(400, 300, { rows: 3, cols: 4, padding: 0 })).toEqual([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 100, y: 0, width: 100, height: 100 },
      { x: 200, y: 0, width: 100, height: 100 },
      { x: 300, y: 0, width: 100, height: 100 },
      { x: 0, y: 100, width: 100, height: 100 },
      { x: 100, y: 100, width: 100, height: 100 },
      { x: 200, y: 100, width: 100, height: 100 },
      { x: 300, y: 100, width: 100, height: 100 },
      { x: 0, y: 200, width: 100, height: 100 },
      { x: 100, y: 200, width: 100, height: 100 },
      { x: 200, y: 200, width: 100, height: 100 },
      { x: 300, y: 200, width: 100, height: 100 },
    ]);
  });

  it('insets each cell by padding', () => {
    expect(createGridRects(200, 100, { rows: 1, cols: 2, padding: 4 })).toEqual([
      { x: 4, y: 4, width: 92, height: 92 },
      { x: 104, y: 4, width: 92, height: 92 },
    ]);
  });

  it('uses custom boundaries and protects cells from excessive padding', () => {
    expect(createGridRects(100, 80, { rows: 2, cols: 2, padding: 0, xBoundaries: [0, 30, 100], yBoundaries: [0, 50, 80] })).toEqual([
      { x: 0, y: 0, width: 30, height: 50 }, { x: 30, y: 0, width: 70, height: 50 },
      { x: 0, y: 50, width: 30, height: 30 }, { x: 30, y: 50, width: 70, height: 30 },
    ]);
    expect(createGridRects(2, 1, { rows: 1, cols: 2, padding: 200 })).toEqual([
      { x: 0, y: 0, width: 1, height: 1 }, { x: 1, y: 0, width: 1, height: 1 },
    ]);
  });
});

describe('normalizeGridAxisBoundaries', () => {
  it('falls back to safe equal cells for invalid values and undersized sources', () => {
    expect(normalizeGridAxisBoundaries(100, 3, [0, 10, 10, 100])).toEqual([0, 33, 67, 100]);
    expect(normalizeGridAxisBoundaries(1, 20)).toEqual([0, 1]);
  });
});
