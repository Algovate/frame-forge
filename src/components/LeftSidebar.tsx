import { useRef, useState, useEffect } from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import {
  Upload,
  FileVideo,
  Settings,
  Loader2,
} from 'lucide-react';
import type { ProcessingPhase } from '../types';
import { Header } from './Header';
import { HEADING, SLIDER_STYLES } from './ui';

interface LeftSidebarProps {
  sourceFile: File | null;
  isProcessing: boolean;
  phase: ProcessingPhase;
  fps: number;
  setFps: (fps: number) => void;
  startTime: number;
  setStartTime: (t: number) => void;
  endTime: number;
  setEndTime: (t: number) => void;
  onFileSelected: (file?: File | null) => void;
  onProcessSource: () => void;
}

export function LeftSidebar(props: LeftSidebarProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Reset range + duration for every (new) source — including none.
    props.setStartTime(0);
    props.setEndTime(-1);
    setVideoDuration(0);
    if (!props.sourceFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(props.sourceFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [props.sourceFile]);

  // Drag-counter pattern: entering a child fires dragleave on the parent and
  // would flicker the highlight without the counter.
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types?.includes('Files')) setIsDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    props.onFileSelected(e.dataTransfer.files?.[0]);
  };

  const handleVideoLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
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
  
  // Calculate estimated frames
  const actualEndTime = props.endTime >= 0 ? props.endTime : videoDuration;
  const estimatedFrames = Math.max(0, Math.floor((actualEndTime - props.startTime) * props.fps));


  return (
    <aside className="lg:col-span-3 flex flex-col h-full overflow-hidden pb-2">
      <Header />
      
      <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar pr-2 pb-4">
        {/* Input source */}
      <div className="glass-panel rounded-card p-5">
        <h2 className={HEADING}>
          <Upload className="w-5 h-5 text-primary" aria-hidden="true" /> Input source
        </h2>
        <label
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`peer-focus-visible:border-primary peer-focus-visible:bg-primary/5 group relative flex flex-col items-center justify-center rounded-control border-2 border-dashed text-center cursor-pointer transition-colors min-h-[160px] p-6 ${
            isDragOver
              ? 'border-primary bg-primary/5 shadow-[0_0_0_4px_var(--accent-glow)]'
              : 'border-hairline-strong hover:border-primary/50 hover:bg-white/[0.02]'
          }`}
        >
          <input
            type="file"
            accept="video/*, image/gif"
            onChange={(e) => props.onFileSelected(e.target.files?.[0])}
            className="peer sr-only"
          />
          {props.sourceFile ? (
            <div className="relative w-full h-full min-h-[140px] flex items-center justify-center">
              {previewUrl ? (
                <>
                  <div className="absolute inset-0 overflow-hidden rounded-[8px] flex items-center justify-center p-1">
                    {props.sourceFile.type.startsWith('video/') ? (
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
                      {props.sourceFile.name}
                    </span>
                    <span className="text-xs text-white/80 mt-1">Click or drop to replace</span>
                  </div>
                </>
              ) : (
                <div className="relative z-10 flex flex-col items-center">
                  <FileVideo className="w-8 h-8 text-primary mb-2" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground max-w-[220px] truncate">
                    {props.sourceFile.name}
                  </span>
                  <span className="text-xs text-muted mt-1">Click or drop to replace</span>
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
                {isDragOver ? 'Drop to load' : 'Drop a video or GIF'}
              </span>
              <span className="text-xs text-muted mt-1">or click to browse</span>
            </>
          )}
        </label>
      </div>

      {/* Parse settings */}
      <div className="glass-panel rounded-card p-5">
        <h2 className={HEADING}>
          <Settings className="w-5 h-5 text-primary" aria-hidden="true" /> Parse settings
        </h2>
        <div className="space-y-6">
          {props.sourceFile && props.sourceFile.type.startsWith('video/') && videoDuration > 0 && (
            <fieldset>
              <div className="flex justify-between items-center mb-2">
                <legend className="text-sm text-muted">Timeline</legend>
                <span className="text-xs font-mono text-muted">
                  {props.startTime.toFixed(2)}s - {actualEndTime.toFixed(2)}s
                </span>
              </div>
              <div className="px-2 pt-1 pb-3">
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

          <fieldset>
            <div className="flex justify-between items-center mb-2">
              <legend className="text-sm text-muted">Frame rate (FPS)</legend>
              <span className="text-xs font-mono text-muted">{props.fps} fps</span>
            </div>
            <div className="px-2 pt-1 pb-2">
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

          <div className="bg-surface-hover border border-hairline rounded-control p-3 flex justify-between items-center">
            <span className="text-sm text-muted">Estimated frames</span>
            <span className="text-base font-semibold text-foreground">{estimatedFrames}</span>
          </div>

          <button
            type="button"
            onClick={props.onProcessSource}
            disabled={!props.sourceFile || props.isProcessing || estimatedFrames <= 0}
            className="w-full min-h-[44px] bg-primary hover:bg-primary-hover text-white rounded-control font-semibold flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_20px_var(--accent-glow)]"
          >
            {extracting ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : null}
            {extracting ? 'Extracting…' : 'Extract frames'}
          </button>
        </div>
      </div>
      </div>
    </aside>
  );
}
