import type { ExtractedFrame } from '../types';
import { randomId } from './media';
import { clampInt } from './numbers';

export interface GridSplitOptions {
  rows: number;
  cols: number;
  padding: number;
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
});

export const createGridRects = (
  imageWidth: number,
  imageHeight: number,
  options: GridSplitOptions,
): GridRect[] => {
  const { rows, cols, padding } = normalizeGridSplitOptions(options);
  const cellWidth = imageWidth / cols;
  const cellHeight = imageHeight / rows;
  const rects: GridRect[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = Math.round(col * cellWidth) + padding;
      const y0 = Math.round(row * cellHeight) + padding;
      const x1 = Math.round((col + 1) * cellWidth) - padding;
      const y1 = Math.round((row + 1) * cellHeight) - padding;
      const x = Math.max(0, Math.min(imageWidth - 1, x0));
      const y = Math.max(0, Math.min(imageHeight - 1, y0));
      const maxWidth = Math.max(1, imageWidth - x);
      const maxHeight = Math.max(1, imageHeight - y);
      rects.push({
        x,
        y,
        width: Math.max(1, Math.min(maxWidth, x1 - x0)),
        height: Math.max(1, Math.min(maxHeight, y1 - y0)),
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
