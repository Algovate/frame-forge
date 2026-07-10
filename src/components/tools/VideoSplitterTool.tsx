import { useState, useCallback, useEffect, useRef, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import {
  Upload,
  Loader2,
  Grid3X3,
  Link2,
  Link2Off,
  Package,
  RefreshCcw,
  Volume2,
  VolumeX,
  FileVideo,
  Frame,
  SlidersHorizontal,
} from 'lucide-react';
import {
  createSplitZip,
  splitVideoGridParts,
  preloadFFmpeg,
  getVideoDimensions,
  MAX_VIDEO_SIZE,
  type SplitVideoPart,
} from '../../utils/ffmpegSpliter';
import { downloadBlob } from '../../utils/exporters';
import { ProcessingOverlay } from '../ProcessingOverlay';
import { HEADING, SLIDER_STYLES } from '../ui';
import type { ToastType } from '../Toast';

interface VideoSplitterToolProps {
  onPushToast: (type: ToastType, message: string) => void;
  onAddSplitPartsToAssetLibrary: (parts: SplitVideoPart[]) => void;
}

export function VideoSplitterTool({
  onPushToast,
  onAddSplitPartsToAssetLibrary,
}: VideoSplitterToolProps) {
  const { t } = useTranslation();
  const [sourceVideo, setSourceVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [splitParts, setSplitParts] = useState<SplitVideoPart[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processMsg, setProcessMsg] = useState('');

  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(4);
  const [gap, setGap] = useState(0);
  const [padding, setPadding] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [isPaddingLinked, setIsPaddingLinked] = useState(true);
  const [removeAudio, setRemoveAudio] = useState(false);

  const setPaddingSide = (side: 'top' | 'right' | 'bottom' | 'left', val: number) => {
    setPadding((prev) => (isPaddingLinked ? { top: val, right: val, bottom: val, left: val } : { ...prev, [side]: val }));
  };

  const [startTimeStr, setStartTimeStr] = useState<string>('');
  const [endTimeStr, setEndTimeStr] = useState<string>('');

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  // Tracks the most recently accepted file so out-of-order dimension probes
  // (rapid A→B selection) don't overwrite the current video's dimensions.
  const currentFileRef = useRef<File | null>(null);

  // Revoke the preview URL when it is replaced or the tool unmounts.
  useEffect(() => {
    if (!videoUrl) return;
    return () => URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => {
    setSplitParts([]);
  }, [rows, cols, gap, padding, removeAudio, startTimeStr, endTimeStr]);

  const acceptVideo = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith('video/')) {
        onPushToast('error', t('app.error_unsupported'));
        return;
      }
      if (file.size > MAX_VIDEO_SIZE) {
        onPushToast('error', t('splitter.error_too_large'));
        return;
      }
      currentFileRef.current = file;
      // Warm up the ffmpeg core now that the user has a video to split. The old
      // code preloaded it on tool mount, which downloaded the ~32MB WASM core on
      // every app open regardless of whether the splitter was ever used.
      void preloadFFmpeg();
      setSourceVideo(file);
      setVideoUrl(URL.createObjectURL(file));
      setSplitParts([]);
      try {
        const dims = await getVideoDimensions(file);
        if (currentFileRef.current === file) setVideoDimensions(dims);
      } catch (e) {
        console.error(e);
        if (currentFileRef.current === file) onPushToast('error', t('splitter.error_load'));
      }
    },
    [onPushToast, t],
  );

  // Drag-counter pattern: entering a child fires dragleave on the parent and
  // would flicker the highlight without the counter.
  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types?.includes('Files')) setIsDragOver(true);
  };
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    acceptVideo(e.dataTransfer.files?.[0]);
  };

  const handleSplit = async () => {
    if (!sourceVideo) return;

    const parsedStart = startTimeStr !== '' ? parseFloat(startTimeStr) : undefined;
    const parsedEnd = endTimeStr !== '' ? parseFloat(endTimeStr) : undefined;

    if (parsedStart !== undefined && (Number.isNaN(parsedStart) || parsedStart < 0)) {
      onPushToast('error', t('splitter.error_trim_invalid'));
      return;
    }
    if (parsedEnd !== undefined && (Number.isNaN(parsedEnd) || parsedEnd < 0)) {
      onPushToast('error', t('splitter.error_trim_invalid'));
      return;
    }
    if (parsedStart !== undefined && parsedEnd !== undefined && parsedEnd <= parsedStart) {
      onPushToast('error', t('splitter.error_end_before_start'));
      return;
    }

    setIsProcessing(true);
    setProcessMsg(t('splitter.loading'));

    try {
      const parts = await splitVideoGridParts(sourceVideo, rows, cols, padding, gap, removeAudio, videoDimensions ?? undefined, parsedStart, parsedEnd, (part, total) => {
        setProcessMsg(t('splitter.processing_step', { part, total }));
      });

      setSplitParts(parts);
      onAddSplitPartsToAssetLibrary(parts);

      onPushToast('success', t('splitter.success_split'));
    } catch (e) {
      console.error(e);
      onPushToast('error', t('splitter.error_process'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    currentFileRef.current = null;
    setSourceVideo(null);
    setVideoDimensions(null);
    setVideoUrl(null);
    setSplitParts([]);
    setStartTimeStr('');
    setEndTimeStr('');
  };

  const handleDownloadZip = async () => {
    if (!sourceVideo || splitParts.length === 0) return;
    setIsProcessing(true);
    setProcessMsg(t('splitter.generating_zip'));
    try {
      const zipBlob = await createSplitZip(splitParts);
      const baseName = sourceVideo.name.replace(/\.[^.]+$/, '');
      downloadBlob(zipBlob, `${baseName}_grid_split.zip`);
      onPushToast('success', t('app.success_zip'));
    } catch (e) {
      console.error(e);
      onPushToast('error', t('app.error_zip'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetPadding = () => {
    setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
  };

  const gridCells = Array.from({ length: rows * cols }, (_, i) => i);

  let outputResolution = '';
  let gridValid = true;
  if (videoDimensions) {
    const availW = Math.max(0, videoDimensions.width - padding.left - padding.right - gap * (cols - 1));
    const availH = Math.max(0, videoDimensions.height - padding.top - padding.bottom - gap * (rows - 1));
    const cellW = Math.floor(availW / cols);
    const cellH = Math.floor(availH / rows);
    outputResolution = `${cellW} × ${cellH}`;
    gridValid = cellW > 0 && cellH > 0;
  }

  // ── Empty state: ImportScreen-style centered dropzone ──────────────────────
  if (!sourceVideo) {
    return (
      <div className="flex-1 min-h-0 w-full">
        <section className="flex flex-col min-h-0 h-full justify-center">
          <div className="w-full max-w-xl mx-auto flex flex-col overflow-visible">
            <div className="glass-panel rounded-card p-5">
              <h2 className={HEADING}>
                <Upload className="w-5 h-5 text-primary" aria-hidden="true" /> {t('splitter.title')}
              </h2>
              <label
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`group relative flex flex-col items-center justify-center rounded-control border-2 border-dashed text-center cursor-pointer transition-colors min-h-[200px] p-6 ${
                  isDragOver
                    ? 'border-primary bg-primary/5 shadow-[0_0_0_4px_var(--accent-glow)]'
                    : 'border-hairline-strong hover:border-primary/50 hover:bg-white/[0.02]'
                }`}
              >
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => acceptVideo(e.target.files?.[0])}
                  className="peer sr-only"
                />
                <Upload
                  className={`w-8 h-8 mb-2 transition-colors ${
                    isDragOver ? 'text-primary' : 'text-muted group-hover:text-primary'
                  }`}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-foreground">{t('splitter.drop_prompt')}</span>
                <span className="text-xs text-muted mt-1">{t('splitter.click_browse')}</span>
                <span className="text-xs text-muted/70 mt-4 max-w-sm leading-relaxed">{t('splitter.desc')}</span>
              </label>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-9 gap-4 w-full">
      {/* Preview */}
      <section className="lg:col-span-6 flex flex-col relative min-h-0">
        <div className="flex-1 glass-panel rounded-card flex flex-col items-center justify-center p-4 relative overflow-hidden">
          {isProcessing && <ProcessingOverlay message={processMsg} />}

          <div className="relative max-w-full max-h-full inline-flex rounded-control overflow-hidden border border-hairline shadow-pop bg-black">
            <video src={videoUrl || ''} autoPlay loop muted controls className="max-w-full max-h-full block" />

            {/* Grid overlay — matches the exact output crop */}
            <div
              className="absolute inset-0 pointer-events-none box-border"
              style={{
                display: 'grid',
                gridTemplateRows: `repeat(${rows}, 1fr)`,
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: `${gap}px`,
                padding: `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`,
              }}
            >
              {gridCells.map((i) => (
                <div key={i} className="border border-white/40 bg-primary/10 transition-colors" />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Right Sidebar */}
      <section className="lg:col-span-3 min-h-0 flex flex-col">
        {/* Source */}
        <div className="glass-panel rounded-card p-3">
          <h2 className={HEADING}>
            <FileVideo className="w-5 h-5 text-primary" aria-hidden="true" /> {t('splitter.source')}
          </h2>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate" title={sourceVideo.name}>
              {sourceVideo.name}
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="shrink-0 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
            >
              {t('header.new_source')}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] font-mono text-muted">
            <span>{(sourceVideo.size / (1024 * 1024)).toFixed(2)} MB</span>
            {videoDimensions && (
              <span>
                {videoDimensions.width} × {videoDimensions.height}
              </span>
            )}
          </div>
        </div>

        {/* Trim */}
        <div className="glass-panel rounded-card p-3">
          <h2 className={HEADING}>
            <SlidersHorizontal className="w-5 h-5 text-primary" aria-hidden="true" /> {t('splitter.trim', 'Trim (Optional)')}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-muted">{t('splitter.start_time', 'Start Time (s)')}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={startTimeStr}
                onChange={(e) => setStartTimeStr(e.target.value)}
                placeholder="0.0"
                className="w-full h-8 bg-surface border border-hairline rounded px-2 text-xs text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-muted">{t('splitter.end_time', 'End Time (s)')}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={endTimeStr}
                onChange={(e) => setEndTimeStr(e.target.value)}
                placeholder="e.g. 5.5"
                className="w-full h-8 bg-surface border border-hairline rounded px-2 text-xs text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/50"
              />
            </label>
          </div>
        </div>

        {/* Grid */}
        <div className="glass-panel rounded-card p-3">
          <h2 className={HEADING}>
            <Grid3X3 className="w-5 h-5 text-primary" aria-hidden="true" /> {t('splitter.grid')}
          </h2>
          <SliderField label={t('splitter.rows')} value={rows} min={1} max={10} onChange={setRows} />
          <SliderField label={t('splitter.cols')} value={cols} min={1} max={10} onChange={setCols} />
          <SliderField label={t('splitter.gap')} value={gap} suffix="px" min={0} max={100} onChange={setGap} />
        </div>

        {/* Padding */}
        <div className="glass-panel rounded-card p-3">
          <h2 className={HEADING}>
            <Frame className="w-5 h-5 text-primary" aria-hidden="true" /> {t('splitter.padding')}
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={handleResetPadding}
                aria-label={t('splitter.reset_padding')}
                className="p-1.5 rounded-control text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsPaddingLinked(!isPaddingLinked)}
                aria-pressed={isPaddingLinked}
                aria-label={t('splitter.link_padding', 'Link padding')}
                className={`p-1.5 rounded-control transition-colors ${
                  isPaddingLinked ? 'text-primary bg-primary/10' : 'text-muted hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                {isPaddingLinked ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
              </button>
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <PaddingField label="Top" value={padding.top} onChange={(v) => setPaddingSide('top', v)} />
            <PaddingField label="Bottom" value={padding.bottom} onChange={(v) => setPaddingSide('bottom', v)} />
            <PaddingField label="Left" value={padding.left} onChange={(v) => setPaddingSide('left', v)} />
            <PaddingField label="Right" value={padding.right} onChange={(v) => setPaddingSide('right', v)} />
          </div>
        </div>

        {/* Output */}
        <div className="glass-panel rounded-card p-3">
          <h2 className={HEADING}>
            <SlidersHorizontal className="w-5 h-5 text-primary" aria-hidden="true" /> {t('splitter.output')}
          </h2>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setRemoveAudio(!removeAudio)}
              aria-pressed={removeAudio}
              className={`w-full min-h-[32px] rounded-control border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                removeAudio
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-hairline text-muted hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              {removeAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {t('splitter.remove_audio')}
            </button>

            {outputResolution && (
              <div className="bg-surface-hover border border-hairline rounded-control p-3 flex justify-between items-center">
                <span className="text-sm text-muted">{t('splitter.output_resolution')}</span>
                <span className="text-sm font-semibold text-foreground font-mono">{outputResolution}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleSplit}
              disabled={isProcessing || (videoDimensions !== null && !gridValid)}
              className="w-full min-h-[44px] bg-primary hover:bg-primary-hover text-white rounded-control font-semibold flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_20px_var(--accent-glow)]"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Grid3X3 className="w-4 h-4" />}
              {isProcessing ? t('splitter.processing') : t('splitter.split_video')}
            </button>

            {splitParts.length > 0 && (
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  disabled={isProcessing}
                  className="w-full min-h-[38px] rounded-control border border-hairline text-muted hover:text-foreground hover:bg-surface-hover text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <Package className="w-4 h-4" />
                  {t('splitter.download_zip')}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Full-width labelled slider — mirrors ImportScreen's fieldset/legend pattern. */
function SliderField({
  label,
  value,
  suffix,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset>
      <div className="flex justify-between items-center mb-2">
        <legend className="text-sm text-muted">{label}</legend>
        <span className="text-xs font-mono text-muted">
          {value}
          {suffix}
        </span>
      </div>
      <div className="px-2 pt-1 pb-3">
        <Slider min={min} max={max} step={step} value={value} onChange={(v) => onChange(v as number)} styles={SLIDER_STYLES} />
      </div>
    </fieldset>
  );
}

/** Compact labelled slider for the 2×2 padding grid. */
function PaddingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset>
      <div className="flex justify-between items-center mb-1">
        <legend className="text-[10px] text-muted">{label}</legend>
        <span className="text-[10px] font-mono text-muted">{value}px</span>
      </div>
      <Slider min={0} max={100} value={value} onChange={(v) => onChange(v as number)} styles={SLIDER_STYLES} />
    </fieldset>
  );
}
