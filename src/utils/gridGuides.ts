import { clampInt } from './numbers';

export const createGridBoundaries = (size: number, cells: number): number[] => {
  const axisSize = Math.max(1, Math.floor(Number.isFinite(size) ? size : 1));
  const count = Math.min(clampInt(cells, 1, 20), axisSize);
  return Array.from({ length: count + 1 }, (_, index) => Math.round(index * axisSize / count));
};

export const moveGridBoundary = (boundaries: number[], index: number, target: number): number[] => {
  if (index <= 0 || index >= boundaries.length - 1) return boundaries;
  const previous = boundaries[index - 1];
  const next = boundaries[index + 1];
  const value = Math.max(previous + 1, Math.min(next - 1, Math.round(target)));
  if (value === boundaries[index]) return boundaries;
  return boundaries.map((boundary, boundaryIndex) => boundaryIndex === index ? value : boundary);
};

export const clientPointToSourcePixel = (
  clientPoint: number,
  overlayRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  sourceSize: number,
  axis: 'x' | 'y' = 'x',
): number => {
  const start = axis === 'x' ? overlayRect.left : overlayRect.top;
  const displayedSize = axis === 'x' ? overlayRect.width : overlayRect.height;
  if (!Number.isFinite(displayedSize) || displayedSize <= 0) return 0;
  return Math.max(0, Math.min(sourceSize, Math.round((clientPoint - start) / displayedSize * sourceSize)));
};
