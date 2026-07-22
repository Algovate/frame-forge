import type { ExtractedFrame } from '../types';
import { randomId } from './media';
import { clampInt } from './numbers';

export interface GridSplitOptions {
  rows: number;
  cols: number;
  padding: number;
  xBoundaries?: number[];
  yBoundaries?: number[];
}

export interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const normalizeGridSplitOptions = (options: GridSplitOptions): GridSplitOptions => ({
  rows: clampInt(options.rows, 1, 20),
  cols: clampInt(options.cols, 1, 20),
  padding: clampInt(options.padding, 0, 200),
  xBoundaries: options.xBoundaries,
  yBoundaries: options.yBoundaries,
});

/**
 * Return integer source-pixel boundaries for one grid axis. A cell can never
 * be smaller than one pixel, so an undersized image has fewer effective cells
 * than the requested grid count.
 */
export const normalizeGridAxisBoundaries = (
  size: number,
  requestedCells: number,
  values?: number[],
): number[] => {
  const axisSize = Math.max(1, Math.floor(Number.isFinite(size) ? size : 1));
  const cells = Math.min(clampInt(requestedCells, 1, 20), axisSize);
  const equal = Array.from({ length: cells + 1 }, (_, index) => Math.round(index * axisSize / cells));
  if (!values || values.length !== cells + 1 || values.some((value) => !Number.isFinite(value))) return equal;

  const boundaries = values.map((value) => Math.round(value));
  if (boundaries[0] !== 0 || boundaries.at(-1) !== axisSize) return equal;
  for (let index = 1; index < boundaries.length; index++) {
    if (boundaries[index] <= boundaries[index - 1] || boundaries[index] > axisSize) return equal;
  }
  return boundaries;
};

export const createGridRects = (
  imageWidth: number,
  imageHeight: number,
  options: GridSplitOptions,
): GridRect[] => {
  const { rows, cols, padding } = normalizeGridSplitOptions(options);
  const width = Math.max(1, Math.floor(imageWidth));
  const height = Math.max(1, Math.floor(imageHeight));
  const xBoundaries = normalizeGridAxisBoundaries(width, cols, options.xBoundaries);
  const yBoundaries = normalizeGridAxisBoundaries(height, rows, options.yBoundaries);
  const rects: GridRect[] = [];

  for (let row = 0; row < yBoundaries.length - 1; row++) {
    for (let col = 0; col < xBoundaries.length - 1; col++) {
      const rawX = xBoundaries[col];
      const rawY = yBoundaries[row];
      const rawWidth = xBoundaries[col + 1] - rawX;
      const rawHeight = yBoundaries[row + 1] - rawY;
      // Cap each axis separately so very large padding cannot collapse two
      // adjacent cells onto the same edge pixel.
      const insetX = Math.min(padding, Math.floor((rawWidth - 1) / 2));
      const insetY = Math.min(padding, Math.floor((rawHeight - 1) / 2));
      const x = rawX + insetX;
      const y = rawY + insetY;
      rects.push({
        x,
        y,
        width: rawWidth - insetX * 2,
        height: rawHeight - insetY * 2,
      });
    }
  }

  return rects;
};

export const splitCanvasIntoGridFrames = (
  sourceCanvas: HTMLCanvasElement,
  options: GridSplitOptions,
  timing: { startTime?: number; timeStep?: number } = {},
): ExtractedFrame[] => {
  const rects = createGridRects(sourceCanvas.width, sourceCanvas.height, options);
  const startTime = timing.startTime ?? 0;
  const timeStep = timing.timeStep ?? 0.1;

  // One scratch canvas reused per cell: resizing width/height clears it, so we
  // avoid a fresh canvas + 2D context per cell (up to 400 for a 20x20 grid).
  const scratch = document.createElement('canvas');
  const ctx = scratch.getContext('2d');
  if (!ctx) throw new Error('No 2D context available');

  return rects.map((rect, i) => {
    scratch.width = rect.width;
    scratch.height = rect.height;
    ctx.drawImage(
      sourceCanvas,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
    const dataUrl = scratch.toDataURL('image/png');
    return {
      id: randomId('grid', i),
      dataUrl,
      sourceDataUrl: dataUrl,
      width: rect.width,
      height: rect.height,
      time: startTime + i * timeStep,
      selected: true,
    };
  });
};
