import {
  Film,
  Wand2,
  Download,
  Archive,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import type { ExtractedFrame, MattingMode, WechatReadiness } from '../types';
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
  mattingMode: MattingMode;
  setMattingMode: (mode: MattingMode) => void;
  readiness: WechatReadiness;
  onRemoveBackgrounds: () => void;
  onExportZIP: () => void;
  onExportGIF: () => void;
  onExportSpriteSheet: () => void;
}

const formatBytes = (bytes?: number) => {
  if (!bytes) return '-';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function RightSidebar(props: RightSidebarProps) {
  if (props.frames.length === 0) return null;

  return (
    <aside className="lg:col-span-3 space-y-4 h-full overflow-y-auto custom-scrollbar pl-2 pb-6">

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
      <div className="glass-panel rounded-card p-4">
        <h2 className={HEADING}>
          <Wand2 className="w-5 h-5 text-dedupe" aria-hidden="true" /> Image cleanup
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Matting mode">
            {[
              { id: 'edge-key' as const, label: 'Edge key' },
              { id: 'conservative' as const, label: 'Conservative' },
              { id: 'balanced' as const, label: 'Balanced' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => props.setMattingMode(mode.id)}
                aria-pressed={props.mattingMode === mode.id}
                disabled={props.isProcessing}
                className={`min-h-[34px] rounded-control border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  props.mattingMode === mode.id
                    ? 'border-matte text-matte bg-matte/10'
                    : 'border-hairline text-muted hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={props.onRemoveBackgrounds}
            disabled={props.isProcessing}
            className="w-full min-h-[44px] bg-matte/10 text-matte hover:bg-matte/20 border border-matte/30 rounded-control text-sm font-medium flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Wand2 className="w-4 h-4" aria-hidden="true" /> Batch cleanup
          </button>
        </div>
      </div>

      {/* Export and readiness */}
      <div className="glass-panel rounded-card p-4">
        <h2 className={HEADING}>
          <Download className="w-5 h-5 text-primary" aria-hidden="true" /> WeChat export
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Metric label="Frames" value={props.readiness.selectedCount} />
            <Metric label="Duration" value={`${(props.readiness.durationMs / 1000).toFixed(1)}s`} />
            <Metric label="Last GIF" value={formatBytes(props.readiness.actualSizeBytes)} />
          </div>

          <label htmlFor="gif-delay" className="block">
            <span className="block text-[11px] text-muted mb-1">Frame delay (ms)</span>
            <input
              id="gif-delay"
              type="number"
              min={20}
              value={props.gifDelay}
              onChange={(e) => props.setGifDelay(Number(e.target.value))}
              className={FIELD}
            />
          </label>

          <ul className="space-y-1 text-xs text-muted">
            {props.readiness.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>

          <ExportButton
            icon={Film}
            title="Export WeChat GIF"
            hint="Uses selected frames and current delay"
            disabled={props.isProcessing}
            onClick={props.onExportGIF}
            primary
          />

          <details className="rounded-control border border-hairline bg-surface-hover/40 p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
              Advanced export options
            </summary>

            <div className="mt-3 space-y-3">
              <fieldset className="space-y-2 rounded-control border border-hairline p-3">
                <legend className="px-1 text-xs font-medium text-muted">Custom size</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label htmlFor="exp-width" className="block">
                    <span className="block text-[11px] text-muted mb-1">Width</span>
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
                    <span className="block text-[11px] text-muted mb-1">Height</span>
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
                    <span className="block text-[11px] text-muted mb-1">Padding</span>
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

              <div className="grid grid-cols-2 gap-2">
                <ExportButton
                  icon={Archive}
                  title="ZIP"
                  hint="Frames"
                  disabled={props.isProcessing}
                  onClick={props.onExportZIP}
                />
                <ExportButton
                  icon={LayoutGrid}
                  title="Sprite"
                  hint="Sheet"
                  disabled={props.isProcessing}
                  onClick={props.onExportSpriteSheet}
                />
              </div>
            </div>
          </details>
        </div>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[8px] border border-hairline bg-background/40 p-2">
      <span className="block text-[10px] text-muted">{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

function ExportButton({
  icon: Icon,
  title,
  hint,
  disabled,
  onClick,
  primary = false,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-center gap-3 w-full min-h-[44px] px-3 rounded-control border disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left ${
        primary
          ? 'bg-primary hover:bg-primary-hover border-primary text-white shadow-[0_0_20px_var(--accent-glow)]'
          : 'bg-surface-hover hover:bg-hairline border-hairline hover:border-primary/40'
      }`}
    >
      <span
        className={`grid place-items-center w-9 h-9 rounded-lg transition-colors shrink-0 ${
          primary ? 'bg-white/15 text-white' : 'bg-background text-muted group-hover:text-primary group-hover:bg-primary/10'
        }`}
      >
        <Icon className="w-5 h-5" aria-hidden="true" />
      </span>
      <span className="flex flex-col min-w-0">
        <span className={`text-sm font-medium leading-tight ${primary ? 'text-white' : 'text-foreground'}`}>{title}</span>
        <span className={`text-xs leading-tight ${primary ? 'text-white/75' : 'text-muted'}`}>{hint}</span>
      </span>
    </button>
  );
}
