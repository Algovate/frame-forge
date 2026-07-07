import { loadImage } from './media';

export type ObjectFitMode = 'contain' | 'cover';

export interface DrawRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export const getObjectFitRect = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: ObjectFitMode,
): DrawRect => {
  const scale =
    mode === 'cover'
      ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
      : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const dw = Math.round(sourceWidth * scale);
  const dh = Math.round(sourceHeight * scale);
  return {
    dx: Math.round((targetWidth - dw) / 2),
    dy: Math.round((targetHeight - dh) / 2),
    dw,
    dh,
  };
};

export const fitImageToCanvas = async (
  dataUrl: string,
  width: number,
  height: number,
  mode: ObjectFitMode = 'contain',
  background = 'transparent',
): Promise<string> => {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  const rect = getObjectFitRect(image.width, image.height, width, height, mode);
  ctx.drawImage(image, rect.dx, rect.dy, rect.dw, rect.dh);
  return canvas.toDataURL('image/png');
};
