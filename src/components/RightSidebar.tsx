import { useState } from 'react';
import {
  Film,
  Wand2,
  Download,
  Archive,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import type { ExtractedFrame } from '../types';
import { AnimationPreview } from './AnimationPreview';
import { HEADING, FIELD } from './ui';

interface RightSidebarProps {
  frames: ExtractedFrame[];
  isProcessing: boolean;
  gifDelay: number;
  setGifDelay: (delay: number) => void;
  exportWidth: number;
  setExportWidth: (w: number) => void;
  exportHeight: number;
  setExportHeight: (h: number) => void;
  spriteCols: number;
  setSpriteCols: (cols: number) => void;
  spritePadding: number;
  setSpritePadding: (pad: number) => void;
  onRemoveBackgrounds: () => void;
  onExportZIP: () => void;
  onExportGIF: () => void;
  onExportSpriteSheet: () => void;
}

/** Single source of truth for the export tabs: their id drives the tab strip,
 *  the per-format fieldset, and the active export button. Add a format here
 *  and it appears everywhere. */
const EXPORT_TABS = [
  { id: 'gif', label: 'GIF', icon: Film, title: 'Export WeChat GIF', hint: 'WeChat 240 x 240' },
  { id: 'zip', label: 'ZIP', icon: Archive, title: 'Export ZIP', hint: 'Advanced frame archive' },
  { id: 'sprite', label: 'Sprite', icon: LayoutGrid, title: 'Export Sprite Sheet', hint: 'Advanced sheet export' },
] as const;

type ExportTabId = (typeof EXPORT_TABS)[number]['id'];

export function RightSidebar(props: RightSidebarProps) {
  const [exportTab, setExportTab] = useState<ExportTabId>('gif');

  if (props.frames.length === 0) return null;

  const activeExport = EXPORT_TABS.find((t) => t.id === exportTab) ?? EXPORT_TABS[0];
  const exportHandlers: Record<ExportTabId, () => void> = {
    zip: props.onExportZIP,
    gif: props.onExportGIF,
    sprite: props.onExportSpriteSheet,
  };

  return (
    <aside className="lg:col-span-3 space-y-5 h-full overflow-y-auto custom-scrollbar pl-2 pb-6">

      {/* Animation Preview */}
      <div className="glass-panel rounded-card p-4 flex flex-col">
        <h2 className={HEADING}>
          <Film className="w-5 h-5 text-primary" aria-hidden="true" /> Preview
        </h2>
        <div className="relative aspect-[4/3] sm:aspect-video w-full min-h-[200px]">
          <AnimationPreview frames={props.frames} delayMs={props.gifDelay} />
        </div>
      </div>

      {/* Image cleanup */}
      <div className="glass-panel rounded-card p-5">
        <h2 className={HEADING}>
          <Wand2 className="w-5 h-5 text-dedupe" aria-hidden="true" /> Image cleanup
        </h2>
        <div className="space-y-2">
          <button
            type="button"
            onClick={props.onRemoveBackgrounds}
            disabled={props.isProcessing}
            className="w-full min-h-[44px] bg-matte/10 text-matte hover:bg-matte/20 border border-matte/30 rounded-control text-sm font-medium flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Wand2 className="w-4 h-4" aria-hidden="true" /> AI batch matting
          </button>
        </div>
      </div>

      {/* Export */}
      <div className="glass-panel rounded-card p-5">
        <h2 className={HEADING}>
          <Download className="w-5 h-5 text-primary" aria-hidden="true" /> Export
        </h2>

        <div className="flex gap-1 p-1 bg-surface-hover rounded-control border border-hairline mb-4">
          {EXPORT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setExportTab(t.id)}
              className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${exportTab === t.id ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <fieldset className="space-y-2 rounded-control border border-hairline p-3">
            <legend className="px-1 text-xs font-medium text-muted">Output size</legend>
            <div className="grid grid-cols-2 gap-2">
              <label htmlFor="exp-width" className="block">
                <span className="block text-[11px] text-muted mb-1">
                  Width <span className="text-muted/60">(0 = auto)</span>
                </span>
                <input
                  id="exp-width"
                  type="number"
                  min={0}
                  value={props.exportWidth}
                  onChange={(e) => props.setExportWidth(Number(e.target.value))}
                  className={FIELD}
                />
              </label>
              <label htmlFor="exp-height" className="block">
                <span className="block text-[11px] text-muted mb-1">
                  Height <span className="text-muted/60">(0 = auto)</span>
                </span>
                <input
                  id="exp-height"
                  type="number"
                  min={0}
                  value={props.exportHeight}
                  onChange={(e) => props.setExportHeight(Number(e.target.value))}
                  className={FIELD}
                />
              </label>
            </div>
          </fieldset>

          {exportTab === 'sprite' && (
            <fieldset className="space-y-2 rounded-control border border-hairline p-3">
              <legend className="px-1 text-xs font-medium text-muted">Sprite sheet</legend>
              <div className="grid grid-cols-2 gap-2">
                <label htmlFor="sprite-cols" className="block">
                  <span className="block text-[11px] text-muted mb-1">Columns</span>
                  <input
                    id="sprite-cols"
                    type="number"
                    min={0}
                    value={props.spriteCols || ''}
                    onChange={(e) => props.setSpriteCols(Number(e.target.value))}
                    placeholder="auto"
                    className={FIELD}
                  />
                </label>
                <label htmlFor="sprite-pad" className="block">
                  <span className="block text-[11px] text-muted mb-1">Padding (px)</span>
                  <input
                    id="sprite-pad"
                    type="number"
                    min={0}
                    value={props.spritePadding || ''}
                    onChange={(e) => props.setSpritePadding(Number(e.target.value))}
                    placeholder="0"
                    className={FIELD}
                  />
                </label>
              </div>
            </fieldset>
          )}

          {exportTab === 'gif' && (
            <fieldset className="space-y-2 rounded-control border border-hairline p-3">
              <legend className="px-1 text-xs font-medium text-muted">Animated GIF</legend>
              <label htmlFor="gif-delay" className="block">
                <span className="block text-[11px] text-muted mb-1">Frame delay (ms)</span>
                <input
                  id="gif-delay"
                  type="number"
                  min={0}
                  value={props.gifDelay}
                  onChange={(e) => props.setGifDelay(Number(e.target.value))}
                  className={FIELD}
                />
              </label>
            </fieldset>
          )}

          <ExportButton
            icon={activeExport.icon}
            title={activeExport.title}
            hint={activeExport.hint}
            disabled={props.isProcessing}
            onClick={exportHandlers[activeExport.id]}
          />
        </div>
      </div>
    </aside>
  );
}

function ExportButton({
  icon: Icon,
  title,
  hint,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-3 w-full min-h-[44px] px-3 rounded-control bg-surface-hover hover:bg-hairline border border-hairline hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
    >
      <span className="grid place-items-center w-9 h-9 rounded-lg bg-background text-muted group-hover:text-primary group-hover:bg-primary/10 transition-colors shrink-0">
        <Icon className="w-5 h-5" aria-hidden="true" />
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-foreground leading-tight">{title}</span>
        <span className="text-xs text-muted leading-tight">{hint}</span>
      </span>
    </button>
  );
}
