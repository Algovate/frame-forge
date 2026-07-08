import { describe, expect, it } from 'vitest';
import { createGridRects, normalizeGridSplitOptions } from './gridExtractor';

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
});
