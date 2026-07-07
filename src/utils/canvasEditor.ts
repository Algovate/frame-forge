/**
 * Canvas utility functions for the Frame Editor.
 * Includes algorithms for Flood Fill, Color Replace, cropping, and more.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A pixel-space rectangle, shared by the single-frame and batch crop paths. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Clamp a pixel-space rectangle so downstream canvas reads/draws never use
 *  negative coordinates or extend beyond the source dimensions. */
export function clampPixelRect(rect: PixelRect, maxWidth: number, maxHeight: number): PixelRect {
  const safeMaxWidth = Math.max(1, Math.round(maxWidth));
  const safeMaxHeight = Math.max(1, Math.round(maxHeight));
  const x = Math.max(0, Math.min(Math.round(rect.x), safeMaxWidth - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y), safeMaxHeight - 1));
  const right = Math.max(x + 1, Math.min(Math.round(rect.x + rect.width), safeMaxWidth));
  const bottom = Math.max(y + 1, Math.min(Math.round(rect.y + rect.height), safeMaxHeight));
  return { x, y, width: right - x, height: bottom - y };
}

/** Convert crop coordinates from the scaled display layer back to source image
 *  pixels. react-image-crop measures the rendered box, while canvas crop uses
 *  natural pixel coordinates. */
export function displayCropToPixelRect(rect: PixelRect, scale: number, maxWidth: number, maxHeight: number): PixelRect {
  const safeScale = scale > 0 ? scale : 1;
  return clampPixelRect(
    {
      x: rect.x / safeScale,
      y: rect.y / safeScale,
      width: rect.width / safeScale,
      height: rect.height / safeScale,
    },
    maxWidth,
    maxHeight,
  );
}

export function isPointInBounds(point: Point, width: number, height: number): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
}

export function colorToHex(color: Color): string {
  const channelToHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`;
}

/** Convert an opacity percentage (0-100) to an 8-bit channel value (0-255). */
export function opacityToByte(opacityPct: number): number {
  return Math.round((opacityPct / 100) * 255);
}

/** Append an 8-bit alpha channel derived from an opacity percentage to a
 *  #RRGGBB hex color, yielding a #RRGGBBAA string for canvas stroke styles. */
export function hexWithAlpha(hex: string, opacityPct: number): string {
  return `${hex}${opacityToByte(opacityPct).toString(16).padStart(2, '0')}`;
}

/** True when the pixel at `idx` matches `target` within `tolerance` on every
 *  channel. Reads the buffer inline so the hot loops don't allocate a Color
 *  object per pixel. */
function pixelMatches(data: Uint8ClampedArray, idx: number, target: Color, tolerance: number): boolean {
  return (
    Math.abs(data[idx] - target.r) <= tolerance &&
    Math.abs(data[idx + 1] - target.g) <= tolerance &&
    Math.abs(data[idx + 2] - target.b) <= tolerance &&
    Math.abs(data[idx + 3] - target.a) <= tolerance
  );
}

/**
 * Performs a flood fill on the given ImageData.
 */
export function floodFill(imageData: ImageData, startX: number, startY: number, fillColor: Color, tolerance: number = 0): ImageData {
  const { width, height, data } = imageData;
  const startIdx = (startY * width + startX) * 4;
  const targetColor: Color = { r: data[startIdx], g: data[startIdx + 1], b: data[startIdx + 2], a: data[startIdx + 3] };

  if (pixelMatches(data, startIdx, fillColor, 0)) {
    return imageData; // Already the same color
  }

  const stack: Point[] = [{ x: startX, y: startY }];
  const processed = new Uint8Array(width * height);

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const pidx = y * width + x;

    if (processed[pidx]) continue;

    const idx = pidx * 4;
    if (pixelMatches(data, idx, targetColor, tolerance)) {
      data[idx] = fillColor.r;
      data[idx + 1] = fillColor.g;
      data[idx + 2] = fillColor.b;
      data[idx + 3] = fillColor.a;
      processed[pidx] = 1;

      if (x > 0) stack.push({ x: x - 1, y });
      if (x < width - 1) stack.push({ x: x + 1, y });
      if (y > 0) stack.push({ x, y: y - 1 });
      if (y < height - 1) stack.push({ x, y: y + 1 });
    }
  }

  return imageData;
}

/**
 * Replaces all pixels of a target color with a replacement color within a tolerance.
 */
export function replaceColor(imageData: ImageData, targetColor: Color, replacementColor: Color, tolerance: number = 0): ImageData {
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    if (pixelMatches(data, i, targetColor, tolerance)) {
      data[i] = replacementColor.r;
      data[i + 1] = replacementColor.g;
      data[i + 2] = replacementColor.b;
      data[i + 3] = replacementColor.a;
    }
  }
  return imageData;
}

/** Crop a source canvas/image to `rect` (pixel space) on a fresh canvas sized
 *  to the rect. Shared by the editor's single-frame crop and the batch crop.
 *  Returns null only if a 2D context is unavailable. */
export function cropToCanvas(src: CanvasImageSource, rect: PixelRect): HTMLCanvasElement | null {
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(src, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
  return canvas;
}

/**
 * Converts a hex color string like "#RRGGBB" or "#RRGGBBAA" to a Color object.
 */
export function hexToColor(hex: string): Color {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) : 255;
  return { r, g, b, a };
}
