import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImportScreen } from './components/ImportScreen';
import { Header } from './components/Header';
import { RightSidebar } from './components/RightSidebar';
import { FrameGallery } from './components/FrameGallery';
import { FrameEditorModal } from './components/FrameEditorModal';
import { ToastStack, type ToastItem, type ToastType } from './components/Toast';
import { AmbientBackground } from './components/AmbientBackground';
import type { ExtractedFrame, MattingMode, ProcessingPhase } from './types';
import { extractFromGIF, extractFromVideo, extractFromImages } from './utils/extractors';
import { findDuplicateFrames, findLoopFrames, findJumpFrames, batchRemoveBackground, cropFrames } from './utils/processors';
import type { PixelRect } from './utils/canvasEditor';
import { exportZIP, exportGIF, exportPNG, exportSpriteSheet } from './utils/exporters';
import { classifyStickerSource, classifySourceKind, revokeFrameUrls, randomId } from './utils/media';
import { WECHAT_STICKER_PRESET, getWechatReadiness } from './utils/wechat';
import { Loader2 } from 'lucide-react';

function App() {
  const { t } = useTranslation();
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
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

  // Validate + normalize a selection. A batch must be all static images; a single
  // file just needs a recognized kind. Returns the files to process, or null after
  // toasting the rejection. `batchVerb` fills the "Batch <verb> only supports…" error.
  const validateSelection = (files: File[], batchVerb: string): File[] | null => {
    if (!files.length) return null;
    const isBatch = files.length > 1;
    const kinds = files.map(classifyStickerSource);
    const ok = isBatch ? kinds.every((k) => k === 'static-image') : !!kinds[0];
    if (!ok) {
      pushToast('error', isBatch ? t('app.error_batch_static', { verb: batchVerb }) : t('app.error_unsupported'));
      return null;
    }
    return isBatch ? files : [files[0]];
  };

  // Shared entry point for both click-input and drag-and-drop
  const acceptFiles = (files: File[]) => {
    const filesToProcess = validateSelection(files, 'loading');
    if (!filesToProcess) return;
    revokeFrameUrls(frames); // free matting output from the previous file
    setFrames([]);
    setSourceFiles(filesToProcess);
    const kind = classifySourceKind(filesToProcess);
    if (kind === 'video' || kind === 'static-image') {
      pushToast('success', t('app.success_loaded', { filename: filesToProcess[0].name }));
    } else {
      // Auto-process static images, GIFs, and batches
      processSource(filesToProcess, false);
    }
  };

  const appendFiles = (files: File[]) => {
    const filesToProcess = validateSelection(files, 'appending');
    if (!filesToProcess) return;
    processSource(filesToProcess, true);
  };

  const processSource = (filesToProcess: File[] = sourceFiles, append: boolean = false) => {
    if (filesToProcess.length === 0) return;
    const kind = classifySourceKind(filesToProcess);
    if (!kind) {
      pushToast('error', t('app.error_unsupported'));
      return;
    }
    runProcessing(
      'extracting',
      t('app.extracting'),
      async () => {
        if (!append) {
          revokeFrameUrls(frames); // free matting output before re-extracting
          setFrames([]);
        }
        let extracted: ExtractedFrame[] = [];
        const onExtractProgress = (f: ExtractedFrame[]) => {
          if (!append) setFrames([...f]);
        };
        if (kind === 'gif') {
          extracted = await extractFromGIF(filesToProcess[0], onExtractProgress);
        } else if (kind === 'video') {
          extracted = (
            await extractFromVideo(filesToProcess[0], fps, startTime, endTime, onExtractProgress)
          ).frames;
        } else {
          // static-image / static-images-batch share one parallel decoder
          extracted = await extractFromImages(filesToProcess, fps);
        }
        setFrames((prev) => append ? [...prev, ...extracted] : extracted);
        const n = extracted.length;
        pushToast('success', append ? t('app.success_appended', { count: n, s: n === 1 ? '' : 's' }) : t('app.success_extracted', { count: n, s: n === 1 ? '' : 's' }));
      },
      t('app.error_extract'),
    );
  };

  const handleFindDuplicates = (threshold: number) =>
    runProcessing('deduping', t('app.finding_duplicates'), async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findDuplicateFrames(frames, threshold);
      setFrames(next);
      const removed = before - next.filter((f) => f.selected).length;
      pushToast('info', removed > 0 ? t('app.success_dedupe', { count: removed, s: removed === 1 ? '' : 's' }) : t('app.no_duplicates'));
    }, t('app.error_extract'));

  const handleFindLoops = (threshold: number) =>
    runProcessing('deduping', t('app.finding_loops'), async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findLoopFrames(frames, threshold);
      setFrames(next);
      const removed = before - next.filter((f) => f.selected).length;
      pushToast('info', removed > 0 ? t('app.success_loop', { count: removed, s: removed === 1 ? '' : 's' }) : t('app.no_loop'));
    }, t('app.error_extract'));

  const handleFindJumps = (threshold: number) =>
    runProcessing('deduping', t('app.finding_jumps'), async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findJumpFrames(frames, threshold);
      setFrames(next);
      const removed = before - next.filter((f) => f.selected).length;
      pushToast('info', removed > 0 ? t('app.success_jump', { count: removed, s: removed === 1 ? '' : 's' }) : t('app.no_jumps'));
    }, t('app.error_extract'));

  const handleInvertSelection = () => {
    setFrames(frames.map((f) => ({ ...f, selected: !f.selected })));
  };

  const handleReverseFrames = () => {
    setFrames([...frames].reverse());
  };

  const handleRemoveSubsequent = (fromId: string) => {
    const idx = frames.findIndex((f) => f.id === fromId);
    if (idx === -1) return;
    setFrames(frames.map((f, i) => (i > idx ? { ...f, selected: false } : f)));
  };

  const handleRemovePreceding = (toId: string) => {
    const idx = frames.findIndex((f) => f.id === toId);
    if (idx === -1) return;
    setFrames(frames.map((f, i) => (i < idx ? { ...f, selected: false } : f)));
  };

  const handleRemoveBackgrounds = () =>
    runProcessing('matting', mattingMode === 'edge-key' ? t('app.cleaning_frames') : t('app.loading_matting'), async () => {
      const next = await batchRemoveBackground(frames, mattingMode, (msg, updatedFrames) => {
        setProcessMsg(msg);
        setFrames([...updatedFrames]);
      });
      setFrames(next);
      pushToast('success', t('app.success_matting'));
    }, t('app.error_matting'));

  const handleExportZIP = () => {
    if (!frames.some((f) => f.selected)) return pushToast('info', t('app.select_first'));
    runProcessing('exporting', t('app.generating_zip'), async () => {
      await exportZIP(frames, exportWidth, exportHeight);
      pushToast('success', t('app.success_zip'));
    }, t('app.error_zip'));
  };
  const handleExportGIF = () => {
    if (!frames.some((f) => f.selected)) return pushToast('info', t('app.select_first'));
    runProcessing('exporting', t('app.encoding_gif'), async () => {
      const result = await exportGIF(frames, gifDelay, exportWidth, exportHeight);
      if (result) {
        pushToast('success', t('app.success_gif', { size: Math.round(result.sizeBytes / 1024) }));
      }
    }, t('app.error_gif'));
  };
  const handleExportPNG = () => {
    const selectedCount = frames.filter((f) => f.selected).length;
    if (selectedCount === 0) return pushToast('info', t('app.select_first'));
    if (selectedCount > 1) {
      // Export as ZIP if multiple are selected
      return handleExportZIP();
    }
    runProcessing('exporting', t('app.exporting_png'), async () => {
      const result = await exportPNG(frames, exportWidth, exportHeight);
      if (result) {
        pushToast('success', t('app.success_png', { size: Math.round(result.sizeBytes / 1024) }));
      }
    }, t('app.error_png'));
  };
  const handleExportSpriteSheet = () => {
    if (!frames.some((f) => f.selected)) return pushToast('info', t('app.select_first'));
    runProcessing(
      'exporting',
      t('app.packing_sprite'),
      async () => {
        await exportSpriteSheet(frames, spriteCols, spritePadding, exportWidth, exportHeight);
        pushToast('success', t('app.success_sprite'));
      },
      t('app.error_sprite'),
    );
  };

  const toggleFrameSelection = (id: string) => {
    setFrames(frames.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)));
  };

  const deleteSelected = () => {
    revokeFrameUrls(frames.filter((f) => f.selected));
    setFrames(frames.filter((f) => !f.selected));
  };
  const deleteUnselected = () => {
    revokeFrameUrls(frames.filter((f) => !f.selected));
    setFrames(frames.filter((f) => f.selected));
  };
  const selectAll = () => {
    setFrames(frames.map((f) => ({ ...f, selected: true })));
  };

  const handleSelectNone = () => {
    setFrames(frames.map((f) => ({ ...f, selected: false })));
  };

  const handleSelectOnly = (id: string) => {
    setFrames(frames.map((f) => ({ ...f, selected: f.id === id })));
  };

  const handleSelectRange = (startId: string, endId: string) => {
    const startIndex = frames.findIndex((f) => f.id === startId);
    const endIndex = frames.findIndex((f) => f.id === endId);
    if (startIndex === -1 || endIndex === -1) return;
    
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);
    
    setFrames(frames.map((f, i) => ({
      ...f,
      selected: (i >= min && i <= max) || f.selected,
    })));
  };

  const handleDuplicateSelected = () => {
    const selectedFrames = frames.filter((f) => f.selected);
    if (selectedFrames.length === 0) return pushToast('info', t('app.select_first'));

    const duplicates = selectedFrames.map((f) => ({
      ...f,
      id: randomId('dup'),
      selected: false,
    }));
    setFrames([...frames, ...duplicates]);
    pushToast('success', t('app.success_duplicate', { count: selectedFrames.length, s: selectedFrames.length === 1 ? '' : 's' }));
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
    if (meta?.close !== false) setEditingFrameId(null);
    pushToast('success', meta?.message ?? t('app.frame_saved'));
  };

  const handleBatchCrop = (rect: PixelRect) => {
    if (!rect.width || !rect.height) return;
    const croppedCount = frames.filter((frame) => frame.selected).length;
    if (croppedCount === 0) return pushToast('info', t('app.select_first'));
    setEditingFrameId(null);
    runProcessing('batch-cropping', t('app.applying_crop'), async () => {
      const updatedFrames = await cropFrames(frames, rect, true);
      setFrames(updatedFrames);
      pushToast('success', t('app.success_crop', { count: croppedCount, s: croppedCount === 1 ? '' : 's' }));
    }, t('app.error_crop'));
  };

  const handleSplitGridFrame = (id: string, splitFrames: ExtractedFrame[]) => {
    if (splitFrames.length === 0) return;
    const idx = frames.findIndex((frame) => frame.id === id);
    if (idx === -1) return;
    revokeFrameUrls([frames[idx]]);
    setFrames([
      ...frames.slice(0, idx),
      ...splitFrames,
      ...frames.slice(idx + 1),
    ]);
    setEditingFrameId(null);
    pushToast('success', t('app.success_split', { count: splitFrames.length, s: splitFrames.length === 1 ? '' : 's' }));
  };

  const editingFrameIndex = editingFrameId ? frames.findIndex((frame) => frame.id === editingFrameId) : -1;
  const editingFrame = editingFrameIndex >= 0 ? frames[editingFrameIndex] : null;
  const previousEditingFrame = editingFrameIndex > 0 ? frames[editingFrameIndex - 1] : null;
  const nextEditingFrame = editingFrameIndex >= 0 && editingFrameIndex < frames.length - 1 ? frames[editingFrameIndex + 1] : null;
  const sourceKind = classifySourceKind(sourceFiles);
  const readiness = getWechatReadiness(frames, exportWidth, exportHeight, gifDelay);

  const handleReset = () => {
    setFrames([]);
    setSourceFiles([]);
    setEditingFrameId(null);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden px-4 sm:px-6 lg:px-8 py-4 text-foreground relative">
      <AmbientBackground />

      <div className="max-w-[1600px] w-full mx-auto flex-none z-10 relative">
        <Header 
          onReset={frames.length > 0 ? handleReset : undefined} 
          onAppendFiles={frames.length > 0 ? appendFiles : undefined}
        />
      </div>

      <main className="flex-1 min-h-0 max-w-[1600px] w-full mx-auto relative flex flex-col">
        {frames.length === 0 ? (
          <ImportScreen
            sourceFiles={sourceFiles}
            isProcessing={isProcessing}
            phase={phase}
            fps={fps}
            setFps={setFps}
            startTime={startTime}
            setStartTime={setStartTime}
            endTime={endTime}
            setEndTime={setEndTime}
            sourceKind={sourceKind}
            onFilesSelected={acceptFiles}
            onProcessSource={() => processSource()}
          />
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 w-full">
            <section className="lg:col-span-9 flex flex-col relative min-h-0">
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
              onDuplicateSelected={handleDuplicateSelected}
              onSelectNone={handleSelectNone}
              onSelectRange={handleSelectRange}
              onSelectOnly={handleSelectOnly}
            />
        </section>

            <RightSidebar
              frames={frames}
              isProcessing={isProcessing}
              gifDelay={gifDelay}
              setGifDelay={setGifDelay}
              exportWidth={exportWidth}
              setExportWidth={setExportWidth}
              exportHeight={exportHeight}
              setExportHeight={setExportHeight}
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
              onExportPNG={handleExportPNG}
              onExportSpriteSheet={handleExportSpriteSheet}
            />
          </div>
        )}
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
          onSplitGrid={handleSplitGridFrame}
        />
      )}
    </div>
  );
}

export default App;
