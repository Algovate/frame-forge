import { useState, useCallback, useEffect, useRef, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { ImportScreen } from '../ImportScreen';
import { RightSidebar } from '../RightSidebar';
import { FrameGallery } from '../FrameGallery';
import { FrameEditorModal } from '../FrameEditorModal';
import type { ToastType } from '../Toast';
import type { AssetLibraryItem, ExtractedFrame, MattingMode, ProcessingPhase } from '../../types';
import { extractFromGIF, extractFromVideo, extractFromImages } from '../../utils/extractors';
import { findDuplicateFrames, findLoopFrames, findJumpFrames, batchRemoveBackground, cropFrames } from '../../utils/processors';
import type { PixelRect } from '../../utils/canvasEditor';
import { exportZIP, exportGIF, exportPNG, exportSpriteSheet } from '../../utils/exporters';
import { classifyStickerSource, classifySourceKind, revokeFrameUrls, cloneFrameUrl, randomId } from '../../utils/media';
import { WECHAT_STICKER_PRESET, getWechatReadiness } from '../../utils/wechat';
import { ProcessingOverlay } from '../ProcessingOverlay';
import { useAppStore } from '../../store';

interface FrameEditorToolProps {
  onPushToast: (type: ToastType, message: string) => void;
  onAssetStatusChange?: (id: string, status: AssetLibraryItem['status'], errorMessage?: string) => void;
}

export function FrameEditorTool({
  onPushToast,
  onAssetStatusChange,
}: FrameEditorToolProps) {
  const { t } = useTranslation();
  const { frames, setFrames, sourceFiles, setSourceFiles, activeAssetId, setActiveAssetId, setAppendFilesHandler, setLoadIncomingClipHandler, isProcessing, setIsProcessing } = useAppStore();
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [processMsg, setProcessMsg] = useState('');
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

  const setEditorFrames = useCallback((action: SetStateAction<ExtractedFrame[]>, status: AssetLibraryItem['status'] = 'edited') => {
    setFrames((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (activeAssetId && onAssetStatusChange) {
        onAssetStatusChange(activeAssetId, next.length > 0 ? status : 'queued');
      }
      return next;
    });
  }, [activeAssetId, onAssetStatusChange]);

  // Register the handler the asset library calls to load a clip into the editor.
  useEffect(() => {
    setLoadIncomingClipHandler((asset: AssetLibraryItem) => {
      revokeFrameUrls(framesRef.current);
      setActiveAssetId(asset.id);
      setFrames([]);
      setSourceFiles([asset.file]);
      setEditingFrameId(null);
      setGifDelay(WECHAT_STICKER_PRESET.gifDelay);
      setExportWidth(WECHAT_STICKER_PRESET.width);
      setExportHeight(WECHAT_STICKER_PRESET.height);
      // Reset extraction trim so a startTime left over from a longer video
      // doesn't make a short clip extract zero frames.
      setStartTime(0);
      setEndTime(-1);
      onPushToast('success', t('app.success_loaded', { filename: asset.name }));
    });
    return () => setLoadIncomingClipHandler(null);
  }, [setLoadIncomingClipHandler, setActiveAssetId, setFrames, setSourceFiles, onPushToast, t]);

  const runProcessing = useCallback(
    (p: ProcessingPhase, message: string, work: () => Promise<void>, errorText: string) => {
      // Re-entrancy guard: read the LIVE store (not the render-captured value) so
      // a rapid double-click can't launch a second extract/matting/export job on
      // the shared singleton ffmpeg while the first is still running — that would
      // collide on shared MEMFS filenames and corrupt output. zustand `set` is
      // synchronous, so this holds even within the same tick before React commits.
      if (useAppStore.getState().isProcessing) return;
      setIsProcessing(true);
      setPhase(p);
      setProcessMsg(message);
      (async () => {
        try {
          await work();
        } catch (e) {
          console.error(e);
          if (activeAssetId && onAssetStatusChange) {
            onAssetStatusChange(activeAssetId, 'error', errorText);
          }
          onPushToast('error', errorText);
        } finally {
          setIsProcessing(false);
        }
      })();
    },
    [activeAssetId, onAssetStatusChange, onPushToast, setIsProcessing],
  );

  const validateSelection = (files: File[], batchVerb: string): File[] | null => {
    if (!files.length) return null;
    const isBatch = files.length > 1;
    const kinds = files.map(classifyStickerSource);
    const ok = isBatch ? kinds.every((k) => k === 'static-image') : !!kinds[0];
    if (!ok) {
      onPushToast('error', isBatch ? t('app.error_batch_static', { verb: batchVerb }) : t('app.error_unsupported'));
      return null;
    }
    return isBatch ? files : [files[0]];
  };

  const acceptFiles = (files: File[]) => {
    const filesToProcess = validateSelection(files, 'loading');
    if (!filesToProcess) return;
    revokeFrameUrls(frames);
    setActiveAssetId(null);
    setFrames([]);
    setSourceFiles(filesToProcess);
    const kind = classifySourceKind(filesToProcess);
    if (kind === 'video' || kind === 'static-image') {
      onPushToast('success', t('app.success_loaded', { filename: filesToProcess[0].name }));
    } else {
      processSource(filesToProcess, false);
    }
  };

  const appendFiles = useCallback((files: File[]) => {
    const filesToProcess = validateSelection(files, 'appending');
    if (!filesToProcess) return;
    processSource(filesToProcess, true);
  }, [onPushToast, t, fps, startTime, endTime, activeAssetId]);

  useEffect(() => {
    setAppendFilesHandler(appendFiles);
    return () => setAppendFilesHandler(null);
  }, [setAppendFilesHandler, appendFiles]);

  const processSource = (filesToProcess: File[] = sourceFiles, append: boolean = false) => {
    if (filesToProcess.length === 0) return;
    const kind = classifySourceKind(filesToProcess);
    if (!kind) {
      onPushToast('error', t('app.error_unsupported'));
      return;
    }
    runProcessing(
      'extracting',
      t('app.extracting'),
      async () => {
        if (!append) {
          revokeFrameUrls(frames);
          setFrames([]);
          if (activeAssetId && onAssetStatusChange) {
            onAssetStatusChange(activeAssetId, 'extracting');
          }
        }
        let extracted: ExtractedFrame[] = [];
        const onExtractProgress = (f: ExtractedFrame[]) => {
          if (!append) setEditorFrames([...f], 'extracting');
        };
        try {
          if (kind === 'gif') {
            extracted = await extractFromGIF(filesToProcess[0], onExtractProgress);
          } else if (kind === 'video') {
            extracted = (
              await extractFromVideo(filesToProcess[0], fps, startTime, endTime, onExtractProgress)
            ).frames;
          } else {
            extracted = await extractFromImages(filesToProcess, fps);
          }
        } catch (e) {
          // A failed non-append extract streams partial frames into the store
          // (via onExtractProgress); the extractor revokes their blob URLs on the
          // way out, which would leave the gallery full of broken images. Clear
          // them so the user lands on the empty state, then re-throw so
          // runProcessing surfaces the error.
          if (!append) {
            revokeFrameUrls(framesRef.current);
            setFrames([]);
          }
          throw e;
        }
        setEditorFrames((prev) => append ? [...prev, ...extracted] : extracted, 'edited');
        const n = extracted.length;
        if (n === 0) {
          // A bad trim window or an empty/decode-only source can yield zero
          // frames — that's not a success.
          onPushToast('info', t('app.no_frames_extracted'));
          return;
        }
        onPushToast('success', append ? t('app.success_appended', { count: n, s: n === 1 ? '' : 's' }) : t('app.success_extracted', { count: n, s: n === 1 ? '' : 's' }));
      },
      t('app.error_extract'),
    );
  };

  const handleFindDuplicates = (threshold: number) =>
    runProcessing('deduping', t('app.finding_duplicates'), async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findDuplicateFrames(frames, threshold);
      setEditorFrames(next);
      const removed = before - next.filter((f) => f.selected).length;
      onPushToast('info', removed > 0 ? t('app.success_dedupe', { count: removed, s: removed === 1 ? '' : 's' }) : t('app.no_duplicates'));
    }, t('app.error_extract'));

  const handleFindLoops = (threshold: number) =>
    runProcessing('deduping', t('app.finding_loops'), async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findLoopFrames(frames, threshold);
      setEditorFrames(next);
      const removed = before - next.filter((f) => f.selected).length;
      onPushToast('info', removed > 0 ? t('app.success_loop', { count: removed, s: removed === 1 ? '' : 's' }) : t('app.no_loop'));
    }, t('app.error_extract'));

  const handleFindJumps = (threshold: number) =>
    runProcessing('deduping', t('app.finding_jumps'), async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findJumpFrames(frames, threshold);
      setEditorFrames(next);
      const removed = before - next.filter((f) => f.selected).length;
      onPushToast('info', removed > 0 ? t('app.success_jump', { count: removed, s: removed === 1 ? '' : 's' }) : t('app.no_jumps'));
    }, t('app.error_extract'));

  const handleInvertSelection = () => {
    setEditorFrames(frames.map((f) => ({ ...f, selected: !f.selected })));
  };

  const handleReverseFrames = () => {
    setEditorFrames([...frames].reverse());
  };

  const handleRemoveSubsequent = (fromId: string) => {
    const idx = frames.findIndex((f) => f.id === fromId);
    if (idx === -1) return;
    setEditorFrames(frames.map((f, i) => (i > idx ? { ...f, selected: false } : f)));
  };

  const handleRemovePreceding = (toId: string) => {
    const idx = frames.findIndex((f) => f.id === toId);
    if (idx === -1) return;
    setEditorFrames(frames.map((f, i) => (i < idx ? { ...f, selected: false } : f)));
  };

  const handleRemoveBackgrounds = () =>
    runProcessing('matting', mattingMode === 'edge-key' ? t('app.cleaning_frames') : t('app.loading_matting'), async () => {
      const next = await batchRemoveBackground(frames, mattingMode, (msg, updatedFrames) => {
        setProcessMsg(msg);
        setEditorFrames([...updatedFrames]);
      });
      setEditorFrames(next);
      onPushToast('success', t('app.success_matting'));
    }, t('app.error_matting'));

  const handleExportZIP = () => {
    if (!frames.some((f) => f.selected)) return onPushToast('info', t('app.select_first'));
    runProcessing('exporting', t('app.generating_zip'), async () => {
      await exportZIP(frames, exportWidth, exportHeight);
      onPushToast('success', t('app.success_zip'));
    }, t('app.error_zip'));
  };
  const handleExportGIF = () => {
    if (!frames.some((f) => f.selected)) return onPushToast('info', t('app.select_first'));
    runProcessing('exporting', t('app.encoding_gif'), async () => {
      const result = await exportGIF(frames, gifDelay, exportWidth, exportHeight);
      if (result) {
        onPushToast('success', t('app.success_gif', { size: Math.round(result.sizeBytes / 1024) }));
      }
    }, t('app.error_gif'));
  };
  const handleExportPNG = () => {
    const selectedCount = frames.filter((f) => f.selected).length;
    if (selectedCount === 0) return onPushToast('info', t('app.select_first'));
    if (selectedCount > 1) {
      return handleExportZIP();
    }
    runProcessing('exporting', t('app.exporting_png'), async () => {
      const result = await exportPNG(frames, exportWidth, exportHeight);
      if (result) {
        onPushToast('success', t('app.success_png', { size: Math.round(result.sizeBytes / 1024) }));
      }
    }, t('app.error_png'));
  };
  const handleExportSpriteSheet = () => {
    if (!frames.some((f) => f.selected)) return onPushToast('info', t('app.select_first'));
    runProcessing(
      'exporting',
      t('app.packing_sprite'),
      async () => {
        await exportSpriteSheet(frames, spriteCols, spritePadding, exportWidth, exportHeight);
        onPushToast('success', t('app.success_sprite'));
      },
      t('app.error_sprite'),
    );
  };

  const toggleFrameSelection = (id: string) => {
    setEditorFrames(frames.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)));
  };

  const deleteSelected = () => {
    revokeFrameUrls(frames.filter((f) => f.selected));
    setEditorFrames(frames.filter((f) => !f.selected));
  };
  const deleteUnselected = () => {
    revokeFrameUrls(frames.filter((f) => !f.selected));
    setEditorFrames(frames.filter((f) => f.selected));
  };
  const selectAll = () => {
    setEditorFrames(frames.map((f) => ({ ...f, selected: true })));
  };

  const handleSelectNone = () => {
    setEditorFrames(frames.map((f) => ({ ...f, selected: false })));
  };

  const handleSelectOnly = (id: string) => {
    setEditorFrames(frames.map((f) => ({ ...f, selected: f.id === id })));
  };

  const handleSelectRange = (startId: string, endId: string) => {
    const startIndex = frames.findIndex((f) => f.id === startId);
    const endIndex = frames.findIndex((f) => f.id === endId);
    if (startIndex === -1 || endIndex === -1) return;
    
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);
    
    setEditorFrames(frames.map((f, i) => ({
      ...f,
      selected: (i >= min && i <= max) || f.selected,
    })));
  };

  const handleDuplicateSelected = async () => {
    const selectedFrames = frames.filter((f) => f.selected);
    if (selectedFrames.length === 0) return onPushToast('info', t('app.select_first'));

    // Give each duplicate its own object URL(s): a shallow copy would alias the
    // original's blob URL, so revoking the duplicate on delete would break the
    // original's preview.
    const duplicates = await Promise.all(selectedFrames.map(async (f) => ({
      ...f,
      id: randomId('dup'),
      selected: false,
      dataUrl: await cloneFrameUrl(f.dataUrl),
      sourceDataUrl: f.sourceDataUrl ? await cloneFrameUrl(f.sourceDataUrl) : undefined,
    })));
    setEditorFrames([...frames, ...duplicates]);
    onPushToast('success', t('app.success_duplicate', { count: selectedFrames.length, s: selectedFrames.length === 1 ? '' : 's' }));
  };

  const handleSaveEdit = (
    id: string,
    newDataUrl: string,
    meta?: { width?: number; height?: number; close?: boolean; message?: string },
  ) => {
    const oldFrame = frames.find((f) => f.id === id);
    if (oldFrame) revokeFrameUrls([oldFrame]); // free the previous blob URL(s)
    setEditorFrames(frames.map(f => f.id === id ? {
      ...f,
      dataUrl: newDataUrl,
      sourceDataUrl: undefined,
      width: meta?.width ?? f.width,
      height: meta?.height ?? f.height,
    } : f));
    if (meta?.close !== false) setEditingFrameId(null);
    onPushToast('success', meta?.message ?? t('app.frame_saved'));
  };

  const handleBatchCrop = (rect: PixelRect) => {
    if (!rect.width || !rect.height) return;
    const croppedCount = frames.filter((frame) => frame.selected).length;
    if (croppedCount === 0) return onPushToast('info', t('app.select_first'));
    setEditingFrameId(null);
    runProcessing('batch-cropping', t('app.applying_crop'), async () => {
      const updatedFrames = await cropFrames(frames, rect, true);
      // cropFrames produced fresh data URLs for the selected frames; revoke the
      // originals now that nothing reads them.
      revokeFrameUrls(frames.filter((f) => f.selected));
      setEditorFrames(updatedFrames);
      onPushToast('success', t('app.success_crop', { count: croppedCount, s: croppedCount === 1 ? '' : 's' }));
    }, t('app.error_crop'));
  };

  const handleSplitGridFrame = (id: string, splitFrames: ExtractedFrame[]) => {
    if (splitFrames.length === 0) return;
    const idx = frames.findIndex((frame) => frame.id === id);
    if (idx === -1) return;
    revokeFrameUrls([frames[idx]]);
    setEditorFrames([
      ...frames.slice(0, idx),
      ...splitFrames,
      ...frames.slice(idx + 1),
    ]);
    setEditingFrameId(null);
    onPushToast('success', t('app.success_split', { count: splitFrames.length, s: splitFrames.length === 1 ? '' : 's' }));
  };

  const editingFrameIndex = editingFrameId ? frames.findIndex((frame) => frame.id === editingFrameId) : -1;
  const editingFrame = editingFrameIndex >= 0 ? frames[editingFrameIndex] : null;
  const previousEditingFrame = editingFrameIndex > 0 ? frames[editingFrameIndex - 1] : null;
  const nextEditingFrame = editingFrameIndex >= 0 && editingFrameIndex < frames.length - 1 ? frames[editingFrameIndex + 1] : null;
  const sourceKind = classifySourceKind(sourceFiles);
  const readiness = getWechatReadiness(frames, exportWidth, exportHeight, gifDelay);

  return (
    <>
      {frames.length === 0 ? (
        <div className="flex-1 min-h-0 w-full">
          <section className="flex flex-col min-h-0 h-full justify-center">
            <div className="w-full max-w-xl mx-auto flex flex-col mt-4 sm:mt-12 overflow-visible">
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
            </div>
          </section>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-9 gap-4 w-full">
          <section className="lg:col-span-6 flex flex-col relative min-h-0">
            {isProcessing && <ProcessingOverlay message={processMsg} />}
            <FrameGallery
              frames={frames}
              isProcessing={isProcessing}
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
            className="lg:col-span-3 min-h-0"
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
    </>
  );
}
