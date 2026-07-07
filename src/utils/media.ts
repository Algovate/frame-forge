/** Shared DOM/image helpers used by both the processing and export pipelines. */

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
  return cvs.toDataURL('image/png');
};

/** Revoke any `blob:` object URLs in a frame list. Call before frames are
 *  cleared or dropped so matting output doesn't leak decoded image data.
 *  No-ops on `data:` URLs. */
export const revokeFrameUrls = (frames: { dataUrl: string }[]) => {
  for (const f of frames) {
    if (f.dataUrl.startsWith('blob:')) URL.revokeObjectURL(f.dataUrl);
  }
};
