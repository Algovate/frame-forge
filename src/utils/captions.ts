import type { CaptionSettings, ExtractedFrame } from '../types';
import { loadImage } from './media';

export const DEFAULT_CAPTION: CaptionSettings = {
  enabled: false,
  text: '',
  fontSize: 32,
  fillColor: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 5,
  position: 'bottom',
};

const getCaptionY = (position: CaptionSettings['position'], height: number, fontSize: number) => {
  if (position === 'top') return fontSize + 12;
  if (position === 'middle') return height / 2 + fontSize / 3;
  return height - 18;
};

const wrapCaptionText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const chars = [...text.trim()];
  const lines: string[] = [];
  let current = '';

  for (const char of chars) {
    const next = current + char;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 2);
};

export const applyCaptionToFrames = async (
  frames: ExtractedFrame[],
  caption: CaptionSettings,
): Promise<ExtractedFrame[]> => {
  if (!caption.enabled || !caption.text.trim()) return frames;

  return Promise.all(
    frames.map(async (frame) => {
      if (!frame.selected) return frame;
      const image = await loadImage(frame.dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return frame;

      ctx.drawImage(image, 0, 0);
      ctx.font = `700 ${caption.fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';

      const lines = wrapCaptionText(ctx, caption.text, canvas.width - 24);
      const lineHeight = Math.round(caption.fontSize * 1.15);
      const firstY =
        getCaptionY(caption.position, canvas.height, caption.fontSize) - ((lines.length - 1) * lineHeight) / 2;

      lines.forEach((line, index) => {
        const y = firstY + index * lineHeight;
        ctx.strokeStyle = caption.strokeColor;
        ctx.lineWidth = caption.strokeWidth;
        ctx.strokeText(line, canvas.width / 2, y);
        ctx.fillStyle = caption.fillColor;
        ctx.fillText(line, canvas.width / 2, y);
      });

      return { ...frame, dataUrl: canvas.toDataURL('image/png') };
    }),
  );
};
