import { useRef, useState, useEffect, type DragEvent, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import {
  Upload,
  FileVideo,
  Settings,
  Loader2,
} from 'lucide-react';
import type { ProcessingPhase, StickerSourceKind } from '../types';
import { HEADING, SLIDER_STYLES } from './ui';

interface ImportScreenProps {
  sourceFiles: File[];
  isProcessing: boolean;
  phase: ProcessingPhase;
  fps: number;
  setFps: (fps: number) => void;
  startTime: number;
  setStartTime: (t: number) => void;
  endTime: number;
  setEndTime: (t: number) => void;
  sourceKind: StickerSourceKind | null;
  onFilesSelected: (files: File[]) => void;
  onProcessSource: () => void;
}

export function ImportScreen(props: ImportScreenProps) {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { sourceFiles, setStartTime, setEndTime } = props;

  useEffect(() => {
    // Reset range + duration for every (new) source — including none.
    setStartTime(0);
    setEndTime(-1);
    setVideoDuration(0);
    if (sourceFiles.length === 0) {
      setPreviewUrl(null);
      return;
    }
    // We only preview the first file in the sidebar
    const url = URL.createObjectURL(sourceFiles[0]);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFiles, setStartTime, setEndTime]);

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
    if (e.dataTransfer.files?.length) {
      props.onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleVideoLoadedMetadata = (e: SyntheticEvent<HTMLVideoElement>) => {
    const duration = (e.target as HTMLVideoElement).duration;
    setVideoDuration(duration);
    if (props.endTime === -1 || props.endTime > duration) {
      props.setEndTime(duration);
    }
  };

  const handleRangeChange = (val: number | number[]) => {
    if (Array.isArray(val)) {
      props.setStartTime(val[0]);
      props.setEndTime(val[1]);
      if (videoRef.current) {
        // Simple heuristic: if start time changed, seek to start, else seek to end
        if (Math.abs(val[0] - props.startTime) > 0.01) {
          videoRef.current.currentTime = val[0];
        } else {
          videoRef.current.currentTime = val[1];
        }
      }
    }
  };

  const extracting = props.isProcessing && props.phase === 'extracting';
  const isVideoSource = props.sourceKind === 'video';
  
  // Calculate estimated frames
  const actualEndTime = props.endTime >= 0 ? props.endTime : videoDuration;
  const estimatedFrames = Math.max(0, Math.floor((actualEndTime - props.startTime) * props.fps));
  const canProcessSource = props.sourceFiles.length > 0 && !props.isProcessing && (!isVideoSource || estimatedFrames > 0);

  const PROCESS_LABELS: Record<StickerSourceKind, string> = {
    gif: t('import.parse_gif'),
    video: t('import.extract_video'),
    'static-image': t('import.load_image'),
    'static-images-batch': t('import.load_images', { count: props.sourceFiles.length }),
  };
  const processLabel = props.sourceKind ? PROCESS_LABELS[props.sourceKind] : t('import.extract_video');
  // The primary process button is identical whether it sits inside the
  // extraction-settings panel (video) or standalone (other source kinds).
  const processButton = (
    <button
      type="button"
      onClick={props.onProcessSource}
      disabled={!canProcessSource}
      className="w-full min-h-[40px] bg-primary hover:bg-primary-hover text-white rounded-control font-semibold flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_20px_var(--accent-glow)]"
    >
      {extracting ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : null}
      {extracting ? t('import.extracting') : processLabel}
    </button>
  );
  // Shared by both the hover overlay and the fallback (non-preview) states below.
  const sourceLabel = props.sourceFiles.length > 1
    ? t('import.images_selected', { count: props.sourceFiles.length })
    : props.sourceFiles[0]?.name ?? '';


  return (
    <div className="w-full max-w-xl mx-auto flex flex-col mt-2 sm:mt-6 overflow-visible">
      
      <div className="flex-1 space-y-4">
        {/* Source */}
      <div className="glass-panel rounded-card p-4">
        <h2 className={`${HEADING} mb-3`}>
          <Upload className="w-5 h-5 text-primary" aria-hidden="true" /> {t('import.sticker_source')}
        </h2>
        <label
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`peer-focus-visible:border-primary peer-focus-visible:bg-primary/5 group relative flex flex-col items-center justify-center rounded-control border-2 border-dashed text-center cursor-pointer transition-colors min-h-[120px] p-4 ${
            isDragOver
              ? 'border-primary bg-primary/5 shadow-[0_0_0_4px_var(--accent-glow)]'
              : 'border-hairline-strong hover:border-primary/50 hover:bg-white/[0.02]'
          }`}
        >
          <input
            type="file"
            multiple
            accept="video/*, image/gif, image/png, image/jpeg, image/webp"
            onChange={(e) => {
              if (e.target.files?.length) {
                props.onFilesSelected(Array.from(e.target.files));
              }
            }}
            className="peer sr-only"
          />
          {props.sourceFiles.length > 0 ? (
            <div className="relative w-full h-full min-h-[120px] flex items-center justify-center">
              {previewUrl ? (
                <>
                  <div className="absolute inset-0 overflow-hidden rounded-[8px] flex items-center justify-center p-1">
                    {isVideoSource ? (
                      <video 
                        ref={videoRef}
                        src={previewUrl} 
                        className="max-w-full max-h-full object-contain rounded-md" 
                        muted 
                        loop 
                        playsInline 
                        autoPlay 
                        onLoadedMetadata={handleVideoLoadedMetadata}
                      />
                    ) : (
                      <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded-md" />
                    )}
                  </div>
                  <div className="absolute inset-1 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-md flex flex-col items-center justify-center backdrop-blur-[2px]">
                    <Upload className="w-6 h-6 text-white mb-2" aria-hidden="true" />
                    <span className="text-sm font-medium text-white max-w-[90%] truncate px-2 text-center leading-tight">
                      {sourceLabel}
                    </span>
                    <span className="text-xs text-white/80 mt-1">{t('import.click_drop_replace')}</span>
                  </div>
                </>
              ) : (
                <div className="relative z-10 flex flex-col items-center">
                  <FileVideo className="w-8 h-8 text-primary mb-2" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground max-w-[220px] truncate">
                    {sourceLabel}
                  </span>
                  <span className="text-xs text-muted mt-1">{t('import.click_drop_replace')}</span>
                </div>
              )}
            </div>
          ) : (
            <>
              <Upload
                className="w-8 h-8 text-muted group-hover:text-primary mb-2 transition-colors"
                aria-hidden="true"
              />
              <span className="text-sm font-medium text-foreground">
                {isDragOver ? t('import.drop_load') : t('import.drop_prompt')}
              </span>
              <span className="text-xs text-muted mt-1">{t('import.click_browse')}</span>
            </>
          )}
        </label>
      </div>

      {/* Extraction settings */}
      {props.sourceFiles.length > 0 && isVideoSource && (
        <div className="glass-panel rounded-card p-4">
          <h2 className={`${HEADING} mb-3`}>
            <Settings className="w-5 h-5 text-primary" aria-hidden="true" /> {t('import.extraction_settings')}
          </h2>
          <div className="space-y-4">
            {isVideoSource && videoDuration > 0 && (
              <fieldset>
                <div className="flex justify-between items-center mb-2">
                  <legend className="text-sm text-muted">{t('import.timeline')}</legend>
                  <span className="text-xs font-mono text-muted">
                    {props.startTime.toFixed(2)}s - {actualEndTime.toFixed(2)}s
                  </span>
                </div>
                <div className="px-2 pt-1 pb-1">
                  <Slider
                    range
                    min={0}
                    max={videoDuration}
                    step={0.01}
                    value={[props.startTime, actualEndTime]}
                    onChange={handleRangeChange}
                    styles={SLIDER_STYLES}
                  />
                </div>
              </fieldset>
            )}

            {isVideoSource && (
              <fieldset>
                <div className="flex justify-between items-center mb-2">
                  <legend className="text-sm text-muted">{t('import.fps')}</legend>
                  <span className="text-xs font-mono text-muted">{props.fps} fps</span>
                </div>
                <div className="px-2 pt-1 pb-1">
                  <Slider
                    min={1}
                    max={60}
                    step={1}
                    value={props.fps}
                    onChange={(val) => props.setFps(val as number)}
                    styles={SLIDER_STYLES}
                  />
                </div>
              </fieldset>
            )}

            <div className="bg-surface-hover border border-hairline rounded-control p-3 flex justify-between items-center">
              <span className="text-sm text-muted">{t('import.estimated_frames')}</span>
              <span className="text-base font-semibold text-foreground">{estimatedFrames}</span>
            </div>

            {processButton}
          </div>
        </div>
      )}

      {props.sourceFiles.length > 0 && !isVideoSource && processButton}
      </div>
    </div>
  );
}
