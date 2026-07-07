import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';
import type { ExtractedFrame } from '../types';

interface AnimationPreviewProps {
  frames: ExtractedFrame[];
  delayMs: number;
}

export function AnimationPreview({ frames, delayMs }: AnimationPreviewProps) {
  const selectedFrames = useMemo(() => frames.filter((f) => f.selected), [frames]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const safeDelay = Math.max(20, delayMs || 100);
  // playRef avoids restarting the timeout chain on every play/pause toggle.
  const playRef = useRef(isPlaying);

  useEffect(() => {
    playRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (selectedFrames.length === 0) return;

    let timeoutId: number;
    const loop = () => {
      if (playRef.current) {
        setCurrentIndex((prev) => (prev + 1) % selectedFrames.length);
      }
      timeoutId = window.setTimeout(loop, safeDelay);
    };

    timeoutId = window.setTimeout(loop, safeDelay);
    return () => window.clearTimeout(timeoutId);
  }, [selectedFrames.length, safeDelay]);

  if (selectedFrames.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black/20 rounded-control border border-hairline p-6 text-center">
        <p className="text-muted text-sm">No frames selected</p>
      </div>
    );
  }

  const safeIndex = currentIndex >= selectedFrames.length ? 0 : currentIndex;
  const currentFrame = selectedFrames[safeIndex];

  return (
    <div className="flex flex-col h-full absolute inset-0 bg-black/20 rounded-control border border-hairline overflow-hidden">
      <div className="flex-1 relative flex items-center justify-center p-2 min-h-0">
        {/* Frame image */}
        <img
          src={currentFrame.dataUrl}
          alt={`Preview frame ${safeIndex}`}
          className="max-w-full max-h-full object-contain drop-shadow-2xl"
        />

        {/* Playback speed indicator */}
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-[11px] font-mono text-white/80">
          {safeDelay} ms
        </div>
      </div>

      <div className="p-4 bg-surface border-t border-hairline flex flex-col gap-4">
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 rounded-full bg-primary hover:bg-primary-hover text-white flex items-center justify-center transition-colors shrink-0 shadow-[0_0_12px_var(--accent-glow)]"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
        </div>

        <div className="text-center text-xs font-mono text-muted">
          Frame {safeIndex + 1} / {selectedFrames.length} · {selectedFrames.length} frames ·{' '}
          {((selectedFrames.length * safeDelay) / 1000).toFixed(1)}s
        </div>
      </div>
    </div>
  );
}
