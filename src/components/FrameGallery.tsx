import { Image as ImageIcon, Trash2, Check, Shuffle, ArrowRightToLine, ArrowLeftToLine, Undo2, Repeat, Zap, Copy, Pen, CheckSquare, Square } from 'lucide-react';
import type { ExtractedFrame } from '../types';
import { useState, type KeyboardEvent } from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { SLIDER_STYLES } from './ui';

interface FrameGalleryProps {
  frames: ExtractedFrame[];
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  onDeleteUnselected: () => void;
  onFindDuplicates?: (threshold: number) => void;
  onFindLoops?: (threshold: number) => void;
  onFindJumps?: (threshold: number) => void;
  onInvertSelection?: () => void;
  onReverseFrames?: () => void;
  onRemoveSubsequent?: (fromId: string) => void;
  onRemovePreceding?: (toId: string) => void;
  onEditFrame?: (id: string) => void;
  onDuplicateSelected?: () => void;
  onSelectNone?: () => void;
  onSelectRange?: (startId: string, endId: string) => void;
  onSelectOnly?: (id: string) => void;
}

const ICON_CTRL =
  'w-8 h-8 flex items-center justify-center rounded-control text-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/** Compact-slider variant: same theme as SLIDER_STYLES with a smaller handle
 *  for the tight similarity-threshold control. */
const SLIDER_STYLES_SM = {
  ...SLIDER_STYLES,
  handle: { ...SLIDER_STYLES.handle, width: 12, height: 12, marginTop: -4 },
};

export function FrameGallery({
  frames,
  onToggleSelection,
  onSelectAll,
  onDeleteSelected,
  onDeleteUnselected,
  onFindDuplicates,
  onFindLoops,
  onFindJumps,
  onInvertSelection,
  onReverseFrames,
  onRemoveSubsequent,
  onRemovePreceding,
  onEditFrame,
  onDuplicateSelected,
  onSelectNone,
  onSelectRange,
  onSelectOnly,
}: FrameGalleryProps) {
  const [threshold, setThreshold] = useState(65);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  
  const selectedCount = frames.filter((f) => f.selected).length;
  const padWidth = String(Math.max(frames.length, 1)).length;

  const handleToggleSelection = (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
    e.preventDefault();
    
    // Shift + Click for range selection
    if (e.shiftKey && lastClickedId && onSelectRange) {
      onSelectRange(lastClickedId, id);
      return;
    }

    // Alt/Option + Click or Cmd/Ctrl + Click on desktop to select ONLY this frame
    if ((e.altKey || e.metaKey || e.ctrlKey) && onSelectOnly) {
      setLastClickedId(id);
      onSelectOnly(id);
      return;
    }

    // Default: toggle
    setLastClickedId(id);
    onToggleSelection(id);
  };

  const handleFrameKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    handleToggleSelection(event, id);
  };

  return (
    <div className="glass-panel rounded-card p-5 flex-1 flex flex-col relative overflow-hidden">
      <div className="flex flex-wrap justify-between items-center gap-y-3 gap-x-2 mb-4">
        <div className="flex flex-wrap items-center justify-between w-full xl:w-auto xl:flex-1 gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" aria-hidden="true" /> Sticker frames
            {frames.length > 0 && (
              <span className="ml-1 font-mono text-xs text-muted tabular-nums">
                {selectedCount}
                <span className="text-muted/60"> / </span>
                {frames.length}
              </span>
            )}
          </h2>

          {frames.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-surface-hover rounded-control border border-hairline xl:ml-auto">
              <span className="text-[11px] text-muted whitespace-nowrap">Similarity:</span>
              <div className="w-16 sm:w-24">
                <Slider min={1} max={100} value={threshold} onChange={(v) => setThreshold(v as number)}
                  styles={SLIDER_STYLES_SM}
                />
              </div>
              <span className="text-[11px] font-mono w-6 mr-1">{threshold}%</span>
              
              <div className="flex items-center gap-1 border-l border-hairline pl-2">
                <button 
                  onClick={() => onFindLoops?.(threshold)} 
                  className="flex items-center gap-1 text-primary hover:bg-primary/10 px-2 py-0.5 rounded transition-colors"
                  title="Find loop frames"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium hidden xl:inline">Loop</span>
                </button>
                <button 
                  onClick={() => onFindJumps?.(threshold)} 
                  className="flex items-center gap-1 text-jump hover:bg-jump/10 px-2 py-0.5 rounded transition-colors"
                  title="Find jump frames"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium hidden xl:inline">Jumps</span>
                </button>
                <button 
                  onClick={() => onFindDuplicates?.(threshold)} 
                  className="flex items-center gap-1 text-dedupe hover:bg-dedupe/10 px-2 py-0.5 rounded transition-colors"
                  title="Find duplicate frames"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium hidden xl:inline">Duplicates</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {frames.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center w-full">
            <button type="button" onClick={() => onSelectAll()} className={ICON_CTRL} title="Select all">
              <CheckSquare className="w-4 h-4" />
            </button>
            {onSelectNone && (
              <button type="button" onClick={() => onSelectNone()} className={ICON_CTRL} title="Select none">
                <Square className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={() => onInvertSelection?.()} className={ICON_CTRL} title="Invert selection">
              <Shuffle className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => onReverseFrames?.()} className={ICON_CTRL} title="Reverse frames">
              <Undo2 className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-1 border-l border-hairline pl-1.5 ml-0.5">
              <button 
                type="button" 
                onClick={() => lastClickedId && onRemovePreceding?.(lastClickedId)} 
                className={ICON_CTRL}
                disabled={!lastClickedId}
                title="Remove frames before the last clicked frame"
              >
                <ArrowLeftToLine className="w-4 h-4" />
              </button>
              
              <button 
                type="button" 
                onClick={() => lastClickedId && onRemoveSubsequent?.(lastClickedId)} 
                className={ICON_CTRL}
                disabled={!lastClickedId}
                title="Remove frames after the last clicked frame"
              >
                <ArrowRightToLine className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 sm:ml-1 border-l border-hairline pl-1.5">
              {onDuplicateSelected && (
                <button type="button" onClick={onDuplicateSelected} className={`${ICON_CTRL} hover:bg-white/10`} title="Duplicate selected frames">
                  <Copy className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={onDeleteSelected} className={`${ICON_CTRL} text-destructive hover:bg-destructive/10`} title="Delete selected frames">
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={onDeleteUnselected} className={`${ICON_CTRL} text-destructive hover:bg-destructive/10`} title="Delete unselected frames">
                <Trash2 className="w-4 h-4 opacity-60" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {frames.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center rounded-control border-2 border-dashed border-hairline min-h-[420px] px-6">
          <ImageIcon className="w-16 h-16 mb-4 text-muted opacity-40" aria-hidden="true" />
          <p className="text-lg text-foreground/80">No sticker frames yet</p>
          <p className="text-sm mt-2 text-muted">
            Load a video or GIF, then extract frames to begin.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {frames.map((frame, index) => (
              <div
                key={frame.id}
                role="button"
                tabIndex={0}
                onClick={(e) => handleToggleSelection(e, frame.id)}
                onKeyDown={(event) => handleFrameKeyDown(event, frame.id)}
                aria-pressed={frame.selected}
                aria-label={`Frame ${index + 1}${frame.selected ? ', selected' : ', not selected'}`}
                style={{ aspectRatio: `${frame.width ?? 16} / ${frame.height ?? 9}` }}
                className={`group relative rounded-control overflow-hidden border cursor-pointer transition-[transform,border-color,box-shadow] duration-150 frame-checker ${
                  frame.selected
                    ? 'border-primary ring-2 ring-primary/60 scale-[1.02] shadow-[0_8px_24px_-12px_var(--accent-glow-strong)]'
                    : 'border-hairline hover:border-primary/50 hover:scale-[1.01]'
                }`}
              >
                <img
                  src={frame.dataUrl}
                  alt={`Frame ${index + 1}`}
                  loading="lazy"
                  className="w-full h-full object-contain"
                />
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] leading-none font-mono text-foreground/80 tabular-nums pointer-events-none">
                  {String(index + 1).padStart(padWidth, '0')}
                </span>
                {frame.selected && (
                  <span className="absolute top-1.5 right-1.5 grid place-items-center w-5 h-5 rounded-full bg-primary text-white shadow-[0_0_12px_var(--accent-glow)] pointer-events-none">
                    <Check className="w-3 h-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditFrame?.(frame.id);
                  }}
                  aria-label="Edit frame"
                  className={`absolute bottom-1.5 right-1.5 p-1.5 rounded-md bg-black/60 text-white transition-opacity hover:bg-black/80 backdrop-blur-sm z-10 ${
                    frame.selected
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                  }`}
                  title="Edit Frame"
                >
                  <Pen className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
