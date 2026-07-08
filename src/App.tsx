import { useCallback, useState } from 'react';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { FrameGallery } from './components/FrameGallery';
import { FrameEditorModal } from './components/FrameEditorModal';
import { ToastStack, type ToastItem, type ToastType } from './components/Toast';
import { AmbientBackground } from './components/AmbientBackground';
import type { ExtractedFrame, MattingMode, ProcessingPhase } from './types';
import { extractFromGIF, extractFromVideo } from './utils/extractors';
import { findDuplicateFrames, findLoopFrames, findJumpFrames, batchRemoveBackground, cropFrames } from './utils/processors';
import type { PixelRect } from './utils/canvasEditor';
import { exportZIP, exportGIF, exportSpriteSheet } from './utils/exporters';
import { classifyStickerSource, revokeFrameUrls } from './utils/media';
import { WECHAT_STICKER_PRESET, getWechatReadiness } from './utils/wechat';
import { Loader2 } from 'lucide-react';

function App() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [processMsg, setProcessMsg] = useState('');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);

  // Settings
  const [fps, setFps] = useState<number>(10);
  const [gifDelay, setGifDelay] = useState<number>(WECHAT_STICKER_PRESET.gifDelay);
  const [exportWidth, setExportWidth] = useState<number>(WECHAT_STICKER_PRESET.width);
  const [exportHeight, setExportHeight] = useState<number>(WECHAT_STICKER_PRESET.height);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(-1);
  const [lastGifSizeBytes, setLastGifSizeBytes] = useState<number | undefined>();
  const [mattingMode, setMattingMode] = useState<MattingMode>('edge-key');

  // Sprite Sheet Settings
  const [spriteCols, setSpriteCols] = useState<number>(0);
  const [spritePadding, setSpritePadding] = useState<number>(0);

  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, type, message }]); // cap at 3
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /** Run an async operation under the processing overlay. Guarantees errors
   *  become a toast (never an unrecovered overlay) and isProcessing always
   *  clears — via try/catch/finally, not just a trailing setter. */
  const runProcessing = useCallback(
    (p: ProcessingPhase, message: string, work: () => Promise<void>, errorText: string) => {
      setIsProcessing(true);
      setPhase(p);
      setProcessMsg(message);
      (async () => {
        try {
          await work();
        } catch (e) {
          console.error(e);
          pushToast('error', errorText);
        } finally {
          setIsProcessing(false);
        }
      })();
    },
    [pushToast],
  );

  /** Shared entry point for both click-input and drag-and-drop, so validation
   *  + feedback can never diverge between the two paths. */
  const acceptFile = useCallback(
    (file?: File | null) => {
      if (!file) return;
      const kind = classifyStickerSource(file);
      if (kind === 'gif' || kind === 'video') {
        revokeFrameUrls(frames); // free matting output from the previous file
        setFrames([]);
        setSourceFile(file);
        setLastGifSizeBytes(undefined);
        pushToast('success', `Loaded ${file.name}`);
        return;
      }
      if (kind === 'static-image') {
        pushToast('info', 'Static image animation is not supported in this version. Use a video or GIF for dynamic stickers.');
        return;
      }
      pushToast('error', 'Unsupported file. Use a video or GIF.');
    },
    [pushToast, frames],
  );

  const processSource = () => {
    if (!sourceFile) return;
    const kind = classifyStickerSource(sourceFile);
    if (kind !== 'gif' && kind !== 'video') {
      pushToast('error', 'Unsupported file. Use a video or GIF.');
      return;
    }
    runProcessing(
      'extracting',
      'Extracting frames...',
      async () => {
        revokeFrameUrls(frames); // free matting output before re-extracting
        setFrames([]);
        setLastGifSizeBytes(undefined);
        let extracted: ExtractedFrame[];
        if (kind === 'gif') {
          extracted = await extractFromGIF(sourceFile, (f) => setFrames([...f]));
        } else {
          extracted = (
            await extractFromVideo(sourceFile, fps, startTime, endTime, (f) => setFrames([...f]))
          ).frames;
        }
        const n = extracted.length;
        pushToast('success', `Extracted ${n} frame${n === 1 ? '' : 's'}`);
      },
      'Could not extract frames from that file',
    );
  };

  const handleFindDuplicates = (threshold: number) =>
    runProcessing('deduping', 'Finding duplicate frames...', async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findDuplicateFrames(frames, threshold);
      setFrames(next);
      setLastGifSizeBytes(undefined);
      const removed = before - next.filter((f) => f.selected).length;
      pushToast('info', removed > 0 ? `Unselected ${removed} duplicate frame${removed === 1 ? '' : 's'}` : 'No duplicate frames found');
    }, 'Could not analyze frames');

  const handleFindLoops = (threshold: number) =>
    runProcessing('deduping', 'Finding loop frames...', async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findLoopFrames(frames, threshold);
      setFrames(next);
      setLastGifSizeBytes(undefined);
      const removed = before - next.filter((f) => f.selected).length;
      pushToast('info', removed > 0 ? `Unselected ${removed} trailing frame${removed === 1 ? '' : 's'} to form loop` : 'No loop found');
    }, 'Could not analyze frames');

  const handleFindJumps = (threshold: number) =>
    runProcessing('deduping', 'Finding jump frames...', async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findJumpFrames(frames, threshold);
      setFrames(next);
      setLastGifSizeBytes(undefined);
      const removed = before - next.filter((f) => f.selected).length;
      pushToast('info', removed > 0 ? `Unselected ${removed} jump frame${removed === 1 ? '' : 's'}` : 'No jump frames found');
    }, 'Could not analyze frames');

  const handleInvertSelection = () => {
    setFrames(frames.map((f) => ({ ...f, selected: !f.selected })));
    setLastGifSizeBytes(undefined);
  };

  const handleReverseFrames = () => {
    setFrames([...frames].reverse());
    setLastGifSizeBytes(undefined);
  };

  const handleRemoveSubsequent = (fromId: string) => {
    const idx = frames.findIndex((f) => f.id === fromId);
    if (idx === -1) return;
    setFrames(frames.map((f, i) => (i > idx ? { ...f, selected: false } : f)));
    setLastGifSizeBytes(undefined);
  };

  const handleRemovePreceding = (toId: string) => {
    const idx = frames.findIndex((f) => f.id === toId);
    if (idx === -1) return;
    setFrames(frames.map((f, i) => (i < idx ? { ...f, selected: false } : f)));
    setLastGifSizeBytes(undefined);
  };

  const handleRemoveBackgrounds = () =>
    runProcessing('matting', mattingMode === 'edge-key' ? 'Cleaning frames...' : 'Loading AI Model & Matting...', async () => {
      const next = await batchRemoveBackground(frames, mattingMode, (msg, updatedFrames) => {
        setProcessMsg(msg);
        setFrames([...updatedFrames]);
      });
      setFrames(next);
      setLastGifSizeBytes(undefined);
      pushToast('success', 'Background removal complete');
    }, 'Background removal failed');

  const handleExportZIP = () => {
    if (!frames.some((f) => f.selected)) return pushToast('info', 'Select at least one frame first');
    runProcessing('exporting', 'Generating ZIP...', async () => {
      await exportZIP(frames, exportWidth, exportHeight);
      pushToast('success', 'ZIP archive ready');
    }, 'ZIP export failed');
  };
  const handleExportGIF = () => {
    if (!frames.some((f) => f.selected)) return pushToast('info', 'Select at least one frame first');
    runProcessing('exporting', 'Encoding GIF...', async () => {
      const result = await exportGIF(frames, gifDelay, exportWidth, exportHeight);
      if (result) {
        setLastGifSizeBytes(result.sizeBytes);
        pushToast('success', `GIF ready (${Math.round(result.sizeBytes / 1024)} KB)`);
      }
    }, 'GIF export failed');
  };
  const handleExportSpriteSheet = () => {
    if (!frames.some((f) => f.selected)) return pushToast('info', 'Select at least one frame first');
    runProcessing(
      'exporting',
      'Packing sprite sheet...',
      async () => {
        await exportSpriteSheet(frames, spriteCols, spritePadding, exportWidth, exportHeight);
        pushToast('success', 'Sprite sheet ready');
      },
      'Sprite sheet export failed',
    );
  };

  const toggleFrameSelection = (id: string) => {
    setFrames(frames.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)));
    setLastGifSizeBytes(undefined);
  };

  const deleteSelected = () => {
    revokeFrameUrls(frames.filter((f) => f.selected));
    setFrames(frames.filter((f) => !f.selected));
    setLastGifSizeBytes(undefined);
  };
  const deleteUnselected = () => {
    revokeFrameUrls(frames.filter((f) => !f.selected));
    setFrames(frames.filter((f) => f.selected));
    setLastGifSizeBytes(undefined);
  };
  const selectAll = () => {
    setFrames(frames.map((f) => ({ ...f, selected: true })));
    setLastGifSizeBytes(undefined);
  };

  const handleSaveEdit = (
    id: string,
    newDataUrl: string,
    meta?: { width?: number; height?: number; close?: boolean; message?: string },
  ) => {
    setFrames(frames.map(f => f.id === id ? {
      ...f,
      dataUrl: newDataUrl,
      sourceDataUrl: undefined,
      width: meta?.width ?? f.width,
      height: meta?.height ?? f.height,
    } : f));
    setLastGifSizeBytes(undefined);
    if (meta?.close !== false) setEditingFrameId(null);
    pushToast('success', meta?.message ?? 'Frame saved');
  };

  const handleBatchCrop = (rect: PixelRect) => {
    if (!rect.width || !rect.height) return;
    const croppedCount = frames.filter((frame) => frame.selected).length;
    if (croppedCount === 0) return pushToast('info', 'Select at least one frame first');
    setEditingFrameId(null);
    runProcessing('batch-cropping', 'Applying crop to selected frames...', async () => {
      const updatedFrames = await cropFrames(frames, rect, true);
      setFrames(updatedFrames);
      setLastGifSizeBytes(undefined);
      pushToast('success', `Cropped ${croppedCount} selected frame${croppedCount === 1 ? '' : 's'}`);
    }, 'Batch crop failed');
  };

  const editingFrameIndex = editingFrameId ? frames.findIndex((frame) => frame.id === editingFrameId) : -1;
  const editingFrame = editingFrameIndex >= 0 ? frames[editingFrameIndex] : null;
  const previousEditingFrame = editingFrameIndex > 0 ? frames[editingFrameIndex - 1] : null;
  const nextEditingFrame = editingFrameIndex >= 0 && editingFrameIndex < frames.length - 1 ? frames[editingFrameIndex + 1] : null;
  const sourceKind = sourceFile ? classifyStickerSource(sourceFile) : null;
  const readiness = getWechatReadiness(frames, exportWidth, exportHeight, gifDelay, lastGifSizeBytes);

  return (
    <div className="h-screen flex flex-col overflow-hidden px-4 sm:px-6 lg:px-8 py-4 text-foreground relative">
      <AmbientBackground />

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-[1600px] w-full mx-auto relative">
        <LeftSidebar
          sourceFile={sourceFile}
          isProcessing={isProcessing}
          phase={phase}
          fps={fps}
          setFps={setFps}
          startTime={startTime}
          setStartTime={setStartTime}
          endTime={endTime}
          setEndTime={setEndTime}
          sourceKind={sourceKind}
          onFileSelected={acceptFile}
          onProcessSource={processSource}
        />

        <section className="lg:col-span-6 flex flex-col relative min-h-0">
          {isProcessing && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-card bg-black/60 backdrop-blur-sm">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-lg font-medium">{processMsg}</p>
            </div>
          )}
          <FrameGallery
            frames={frames}
            onToggleSelection={toggleFrameSelection}
            onSelectAll={selectAll}
            onDeleteSelected={deleteSelected}
            onDeleteUnselected={deleteUnselected}
            onFindDuplicates={handleFindDuplicates}
            onFindLoops={handleFindLoops}
            onFindJumps={handleFindJumps}
            onInvertSelection={handleInvertSelection}
            onReverseFrames={handleReverseFrames}
            onRemoveSubsequent={handleRemoveSubsequent}
            onRemovePreceding={handleRemovePreceding}
            onEditFrame={setEditingFrameId}
          />
        </section>

        <RightSidebar
          frames={frames}
          isProcessing={isProcessing}
          gifDelay={gifDelay}
          setGifDelay={(delay) => {
            setGifDelay(delay);
            setLastGifSizeBytes(undefined);
          }}
          exportWidth={exportWidth}
          setExportWidth={(width) => {
            setExportWidth(width);
            setLastGifSizeBytes(undefined);
          }}
          exportHeight={exportHeight}
          setExportHeight={(height) => {
            setExportHeight(height);
            setLastGifSizeBytes(undefined);
          }}
          spriteCols={spriteCols}
          setSpriteCols={setSpriteCols}
          spritePadding={spritePadding}
          setSpritePadding={setSpritePadding}
          mattingMode={mattingMode}
          setMattingMode={setMattingMode}
          readiness={readiness}
          onRemoveBackgrounds={handleRemoveBackgrounds}
          onExportZIP={handleExportZIP}
          onExportGIF={handleExportGIF}
          onExportSpriteSheet={handleExportSpriteSheet}
        />
      </main>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {editingFrameId && (
        <FrameEditorModal
          frame={editingFrame}
          previousFrame={previousEditingFrame}
          nextFrame={nextEditingFrame}
          onClose={() => setEditingFrameId(null)}
          onSave={handleSaveEdit}
          onBatchCrop={handleBatchCrop}
        />
      )}
    </div>
  );
}

export default App;
