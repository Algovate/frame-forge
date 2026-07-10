/** Shared DOM/image helpers used by both the processing and export pipelines. */
import type { StickerSourceKind } from '../types';

const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv', 'avi', 'flv', 'wmv', '3gp', 'ts'];
const STATIC_IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];

export const classifyStickerSource = (file: File): StickerSourceKind | null => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.type === 'image/gif' || ext === 'gif') return 'gif';
  if (file.type.startsWith('video/') || VIDEO_EXT.includes(ext)) return 'video';
  if ((file.type.startsWith('image/') && file.type !== 'image/gif') || STATIC_IMAGE_EXT.includes(ext)) {
    return 'static-image';
  }
  return null;
};

/** Classify a whole selection: a multi-file load is a static-image batch;
 *  a single file is classified individually. The batch arity lives here so
 *  call sites don't each re-derive `length > 1 ? 'static-images-batch' : ...`. */
export const classifySourceKind = (files: File[]): StickerSourceKind | null =>
  files.length > 1 ? 'static-images-batch' : files.length === 1 ? classifyStickerSource(files[0]) : null;

/** Short, non-cryptographic id for frame instances — just needs to be unique
 *  within a session (React keys, selection, matting source tracking). Pass an
 *  index to fold it into the id for readable ordering (`gif_0`, `img_3`). */
export const randomId = (prefix: string, index?: number): string => {
  const rand = Math.random().toString(36).slice(2, 9);
  return index === undefined ? `${prefix}_${rand}` : `${prefix}_${index}_${rand}`;
};

/** Load an HTMLImageElement from any src the browser accepts
 *  (data URL, blob URL, http URL). Rejects on error so callers can't hang
 *  forever on a corrupt/revoked source. */
export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image`));
    img.src = src;
  });

/** Rasterize a canvas to a fresh `blob:` URL. Resolves to `fallback` (empty
 *  string by default) when encoding fails, so callers never get a dangling URL.
 *  Shared by the GIF/image extractors and resizeImage. */
export const canvasToBlobUrl = (
  canvas: HTMLCanvasElement,
  type = 'image/png',
  fallback = '',
): Promise<string> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : fallback), type);
  });

/** Rasterize a canvas straight to a Blob — skips the base64 encode/decode
 *  round-trip that `toDataURL` + `atob` would require. Resolves to `null`
 *  when the browser can't encode the requested type. */
export const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type = 'image/png',
): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type));

/** Decode a `data:` URL back to a Blob in-memory (no fetch round-trip), for
 *  sources that only expose a data URL (e.g. grid-split frame output) when the
 *  consumer needs a Blob. */
export const dataUrlToBlob = (dataUrl: string): Blob => {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return new Blob([]);
  const header = dataUrl.slice(0, comma);
  const byteString = atob(dataUrl.slice(comma + 1));
  const mime = /:(.*?);/.exec(header)?.[1] ?? 'image/png';
  const ia = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ia], { type: mime });
};

/** Resize a frame's data URL to w×h. Returns the original data URL unchanged
 *  when either dimension is missing (the "auto" case). */
export const resizeImage = async (dataUrl: string, w: number, h: number): Promise<string> => {
  if (!w || !h) return dataUrl;
  const img = await loadImage(dataUrl);
  const cvs = document.createElement('canvas');
  cvs.width = w;
  cvs.height = h;
  const c = cvs.getContext('2d');
  c?.drawImage(img, 0, 0, w, h);
  return canvasToBlobUrl(cvs, 'image/png', dataUrl);
};

/** Revoke any `blob:` object URLs in a frame list. Call before frames are
 *  cleared or dropped so matting output doesn't leak decoded image data.
 *  Revokes both `dataUrl` and `sourceDataUrl`; no-ops on `data:` URLs. */
export const revokeFrameUrls = (frames: { dataUrl: string; sourceDataUrl?: string }[]) => {
  for (const f of frames) {
    if (f.dataUrl.startsWith('blob:')) URL.revokeObjectURL(f.dataUrl);
    if (f.sourceDataUrl?.startsWith('blob:')) URL.revokeObjectURL(f.sourceDataUrl);
  }
};

/** Return an independent URL for a frame image so the copy can be revoked
 *  without affecting the original. `blob:` URLs alias the same handle when
 *  shallow-copied (e.g. duplicating a frame), so re-create the handle from the
 *  underlying bytes; `data:` URLs are immutable and can be shared as-is. */
export const cloneFrameUrl = async (url: string): Promise<string> => {
  if (!url.startsWith('blob:')) return url;
  const blob = await (await fetch(url)).blob();
  return URL.createObjectURL(blob);
};
