import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import JSZip from 'jszip';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

/** Max source size the splitter will accept (also enforced in the UI). */
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

export function getVideoDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (action: () => void) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      action();
    };
    // Metadata should arrive in well under a second; guard against files that
    // never fire loadedmetadata or error and would otherwise hang the promise.
    const timer = setTimeout(() => done(() => reject(new Error('Failed to load video metadata'))), 10000);
    video.onloadedmetadata = () =>
      done(() => {
        clearTimeout(timer);
        resolve({ width: video.videoWidth, height: video.videoHeight });
      });
    video.onerror = () =>
      done(() => {
        clearTimeout(timer);
        reject(new Error('Failed to load video metadata'));
      });
    video.src = url;
  });
}

let ffmpegInstance: FFmpeg | null = null;
let isLoading = false;

export async function preloadFFmpeg(): Promise<void> {
  if (ffmpegInstance || isLoading) return;
  isLoading = true;
  
  try {
    const ffmpeg = new FFmpeg();
    if (import.meta.env.DEV) {
      ffmpeg.on('log', ({ message }) => console.log('[ffmpeg log]', message));
    }
    
    await ffmpeg.load({
      coreURL: await toBlobURL(coreURL, 'text/javascript'),
      wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
    });
    
    ffmpegInstance = ffmpeg;
  } catch (error) {
    console.error('Failed to preload FFmpeg:', error);
  } finally {
    isLoading = false;
  }
}

export async function splitVideoGrid(
  file: File,
  rows: number,
  cols: number,
  padding: { top: number; right: number; bottom: number; left: number } = { top: 0, right: 0, bottom: 0, left: 0 },
  gap: number = 0,
  removeAudio: boolean = false,
  dimensions?: { width: number; height: number },
  onProgress?: (part: number, total: number) => void
): Promise<Blob> {
  if (file.size > MAX_VIDEO_SIZE) {
    throw new Error('FILE_TOO_LARGE');
  }

  // Ensure FFmpeg is loaded
  if (!ffmpegInstance) {
    await preloadFFmpeg();
    if (!ffmpegInstance) throw new Error('Failed to load FFmpeg');
  }
  
  const ffmpeg = ffmpegInstance;

  const dims = dimensions ?? (await getVideoDimensions(file));
  if (!dims.width || !dims.height) {
    throw new Error('Invalid video dimensions');
  }

  const availWidth = dims.width - padding.left - padding.right - gap * (cols - 1);
  const availHeight = dims.height - padding.top - padding.bottom - gap * (rows - 1);

  const cellWidth = Math.floor(availWidth / cols);
  const cellHeight = Math.floor(availHeight / rows);
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error('Grid padding/gap leaves no room for cells');
  }

  // Get extension from original file or default to mp4
  const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '.mp4';
  const inputName = `input${ext}`;
  const baseName = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const zip = new JSZip();
  const total = rows * cols;
  let current = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      current++;
      if (onProgress) onProgress(current, total);
      
      const x = padding.left + c * (cellWidth + gap);
      const y = padding.top + r * (cellHeight + gap);
      const outputName = `${baseName}_part_${r}_${c}.mp4`;
      
      const args = [
        '-i', inputName,
        '-vf', `crop=${cellWidth}:${cellHeight}:${x}:${y}`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
      ];
      
      if (removeAudio) {
        args.push('-an');
      } else {
        // Transcode to AAC: stream-copying non-MP4 audio (e.g. Opus from webm)
        // into the .mp4 container is invalid and makes ffmpeg fail.
        args.push('-c:a', 'aac');
      }
      args.push(outputName);

      // Use FFmpeg crop filter, re-encode video with ultrafast preset
      await ffmpeg.exec(args);
      
      const data = await ffmpeg.readFile(outputName);
      zip.file(outputName, data);
      
      // Free memory for this part
      await ffmpeg.deleteFile(outputName);
    }
  }

  // Free memory for input file
  await ffmpeg.deleteFile(inputName);

  return await zip.generateAsync({ type: 'blob' });
}
