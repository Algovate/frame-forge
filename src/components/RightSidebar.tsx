import { useTranslation } from 'react-i18next';
import {
  Film,
  Wand2,
  Download,
  Archive,
  LayoutGrid,
  Image as ImageIcon,
  SlidersHorizontal,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import type { ExtractedFrame, MattingMode, WechatReadiness } from '../types';
import { AnimationPreview } from './AnimationPreview';
import { HEADING, FIELD, SLIDER_STYLES } from './ui';
import { clampMin } from '../utils/numbers';

interface RightSidebarProps {
  className?: string;
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
  onExportPNG: () => void;
  onExportSpriteSheet: () => void;
}

/** Matting-mode buttons; static, so defined once at module scope. */
const MATTING_MODES: { id: MattingMode; label: string }[] = [
  { id: 'edge-key', label: 'Edge' },
  { id: 'conservative', label: 'Conserv' },
  { id: 'balanced', label: 'Balance' },
];

export function RightSidebar(props: RightSidebarProps) {
  const { t } = useTranslation();
  if (props.frames.length === 0) return null;

  const isStatic = props.frames.length <= 1;
  const hasSelectedFrames = props.readiness.selectedCount > 0;
  const previewFrame = props.frames.find((frame) => frame.selected) ?? props.frames[0];
  const disableFrameActions = props.isProcessing || !hasSelectedFrames;
  const canExport = !disableFrameActions;
  const activePreset = props.exportWidth === 240 && props.exportHeight === 240 && props.gifDelay === 100
    ? 'wechat'
    : props.exportWidth === 128 && props.exportHeight === 128 && props.gifDelay === 50
      ? 'discord'
      : previewFrame.width === props.exportWidth && previewFrame.height === props.exportHeight
        ? 'original'
        : null;

  const applyPreset = (preset: 'wechat' | 'discord' | 'original') => {
    if (preset === 'wechat') {
      props.setExportWidth(240);
      props.setExportHeight(240);
      props.setGifDelay(100);
    } else if (preset === 'discord') {
      props.setExportWidth(128);
      props.setExportHeight(128);
      props.setGifDelay(50);
    } else if (previewFrame.width && previewFrame.height) {
      props.setExportWidth(previewFrame.width);
      props.setExportHeight(previewFrame.height);
    }
  };

  return (
    <aside className={`lg:col-span-3 space-y-2.5 h-full overflow-y-auto custom-scrollbar pl-2 pb-4 ${props.className ?? ''}`}>

      {/* Preview */}
      <div className="glass-panel rounded-card p-2.5 flex flex-col">
        <h2 className={HEADING}>
          {isStatic ? (
            <ImageIcon className="w-5 h-5 text-primary" aria-hidden="true" />
          ) : (
            <Film className="w-5 h-5 text-primary" aria-hidden="true" />
          )}
          <span>{t('sidebar.preview')}</span>
          <span className="ml-auto text-[11px] font-normal text-muted font-mono bg-background/50 px-2 py-1 rounded-md border border-hairline">
            {props.readiness.selectedCount} / {props.frames.length}
          </span>
        </h2>
        {isStatic ? (
          <div className="frame-checker relative aspect-[4/3] w-full rounded-control border border-hairline overflow-hidden flex items-center justify-center p-2.5">
            <img
              src={previewFrame.dataUrl}
              alt="Selected frame preview"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : (
          <div className="relative aspect-[4/3] sm:aspect-video w-full">
            <AnimationPreview frames={props.frames} delayMs={props.gifDelay} />
          </div>
        )}
      </div>

      {/* Prepare */}
      <div className="glass-panel rounded-card p-2.5">
        <h2 className={HEADING}>
          <Wand2 className="w-4 h-4 text-matte" aria-hidden="true" /> {t('workflow.refine')}
        </h2>
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Matting mode">
            {MATTING_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => props.setMattingMode(mode.id)}
                aria-pressed={props.mattingMode === mode.id}
                disabled={props.isProcessing}
                className={`min-h-[28px] rounded-control border text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  props.mattingMode === mode.id
                    ? 'border-matte text-matte bg-matte/10'
                    : 'border-hairline text-muted hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                {mode.id === 'edge-key' ? t('sidebar.matting_edge') : mode.id === 'conservative' ? t('sidebar.matting_conserv') : t('sidebar.matting_balance')}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={props.onRemoveBackgrounds}
            disabled={disableFrameActions}
            className="w-full min-h-[32px] bg-matte/10 text-matte hover:bg-matte/20 border border-matte/30 rounded-control text-xs font-medium flex justify-center items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Wand2 className="w-3.5 h-3.5" aria-hidden="true" /> {isStatic ? t('sidebar.cleanup') : t('sidebar.batch_cleanup')}
          </button>
        </div>
      </div>

      {/* Output */}
      <div className="glass-panel rounded-card p-2.5">
        <h2 className={HEADING}>
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4 text-primary" aria-hidden="true" /> {t('sidebar.output')}
          </div>
        </h2>
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">{t('sidebar.presets')}</legend>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t('sidebar.presets')}>
              {(['wechat', 'discord', 'original'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={activePreset === preset}
                  disabled={props.isProcessing || (preset === 'original' && !previewFrame.width)}
                  onClick={() => applyPreset(preset)}
                  className={`min-h-[32px] rounded-control border px-1.5 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    activePreset === preset
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-hairline text-muted hover:bg-surface-hover hover:text-foreground'
                  }`}
                >
                  {preset === 'wechat' ? t('sidebar.preset_wechat_short') : preset === 'discord' ? t('sidebar.preset_discord_short') : t('sidebar.preset_original_short')}
                </button>
              ))}
            </div>
          </fieldset>
          {!isStatic && (
            <fieldset>
              <div className="flex justify-between items-center mb-1">
                <legend className="text-[11px] text-muted">{t('sidebar.frame_delay')}</legend>
                <span className="text-[11px] font-mono text-muted">{props.gifDelay} ms</span>
              </div>
              <div className="px-1 pt-1 pb-1">
                <Slider
                  min={20}
                  max={500}
                  step={10}
                  value={props.gifDelay}
                  onChange={(value) => props.setGifDelay(clampMin(value as number, 20, 100))}
                  styles={SLIDER_STYLES}
                />
              </div>
            </fieldset>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label htmlFor="exp-width" className="block">
              <span className="block text-[10px] text-muted mb-0.5">{t('sidebar.width')}</span>
              <input
                id="exp-width"
                type="number"
                min={0}
                value={props.exportWidth}
                onChange={(e) => props.setExportWidth(clampMin(e.currentTarget.valueAsNumber, 0, 0))}
                className={FIELD}
              />
            </label>
            <label htmlFor="exp-height" className="block">
              <span className="block text-[10px] text-muted mb-0.5">{t('sidebar.height')}</span>
              <input
                id="exp-height"
                type="number"
                min={0}
                value={props.exportHeight}
                onChange={(e) => props.setExportHeight(clampMin(e.currentTarget.valueAsNumber, 0, 0))}
                className={FIELD}
              />
            </label>
          </div>

          {props.readiness.messages.length > 0 && (
            <ul className="space-y-0.5 text-[10px] text-muted leading-tight">
              {props.readiness.messages.map((message) => (
                <li key={message}>{t(message)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Export */}
      <div className="glass-panel rounded-card p-2.5">
        <h2 className={HEADING}>
          <Download className="w-4 h-4 text-primary" aria-hidden="true" /> {t('sidebar.export')}
        </h2>
        <div className="space-y-2">
          <div className={`flex items-center gap-2 rounded-control border px-2.5 py-2 text-[11px] ${
            canExport ? 'border-primary/30 bg-primary/5 text-foreground' : 'border-hairline bg-surface-hover/40 text-muted'
          }`} role="status" aria-live="polite">
            <CheckCircle2 className={`h-4 w-4 shrink-0 ${canExport ? 'text-primary' : 'text-muted'}`} aria-hidden="true" />
            <span>{canExport ? t('sidebar.ready_to_export') : props.isProcessing ? t('sidebar.export_processing') : t('sidebar.export_needs_selection')}</span>
          </div>
          {!isStatic && (
            <ExportButton
              icon={Film}
              title={t('sidebar.export_wechat_gif')}
              hint={t('sidebar.hint_gif')}
              disabled={disableFrameActions}
              onClick={props.onExportGIF}
              primary
            />
          )}

          <ExportButton
            icon={ImageIcon}
            title={t('sidebar.export_wechat_png')}
            hint={props.readiness.selectedCount > 1 ? t('sidebar.hint_png_zip') : t('sidebar.hint_png_single')}
            disabled={disableFrameActions}
            onClick={props.onExportPNG}
            primary={isStatic}
          />

          <details className="rounded-control border border-hairline bg-surface-hover/40 p-2">
            <summary className="cursor-pointer text-[11px] font-medium text-muted hover:text-foreground">
              {t('sidebar.advanced_export')}
            </summary>

            <div className="mt-2 space-y-2">
              {!isStatic && (
                <>
                  <fieldset className="space-y-1 rounded-control border border-hairline p-2">
                    <legend className="px-1 text-[10px] font-medium text-muted">{t('sidebar.sprite_sheet')}</legend>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label htmlFor="sprite-cols" className="block">
                        <span className="block text-[10px] text-muted mb-0.5">{t('sidebar.columns')}</span>
                        <input
                          id="sprite-cols"
                          type="number"
                          min={0}
                          value={props.spriteCols || ''}
                          onChange={(e) => props.setSpriteCols(clampMin(e.currentTarget.valueAsNumber, 0, 0))}
                          placeholder={t('sidebar.auto')}
                          className={FIELD}
                        />
                      </label>
                      <label htmlFor="sprite-pad" className="block">
                        <span className="block text-[10px] text-muted mb-0.5">{t('sidebar.padding')}</span>
                        <input
                          id="sprite-pad"
                          type="number"
                          min={0}
                          value={props.spritePadding || ''}
                          onChange={(e) => props.setSpritePadding(clampMin(e.currentTarget.valueAsNumber, 0, 0))}
                          placeholder="0"
                          className={FIELD}
                        />
                      </label>
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-2 gap-1.5">
                    <ExportButton
                      icon={Archive}
                      title={t('sidebar.zip')}
                      hint={t('sidebar.hint_zip')}
                      disabled={disableFrameActions}
                      onClick={props.onExportZIP}
                    />
                    <ExportButton
                      icon={LayoutGrid}
                      title={t('sidebar.sprite')}
                      hint={t('sidebar.hint_sprite')}
                      disabled={disableFrameActions}
                      onClick={props.onExportSpriteSheet}
                    />
                  </div>
                </>
              )}
            </div>
          </details>
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
      className={`group flex items-center gap-2.5 w-full min-h-[36px] px-2.5 py-1.5 rounded-control border disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left ${
        primary
          ? 'bg-primary hover:bg-primary-hover border-primary text-white shadow-[0_0_12px_var(--accent-glow)]'
          : 'bg-surface-hover hover:bg-hairline border-hairline hover:border-primary/40'
      }`}
    >
      <span
        className={`grid place-items-center w-7 h-7 rounded-md transition-colors shrink-0 ${
          primary ? 'bg-white/15 text-white' : 'bg-background text-muted group-hover:text-primary group-hover:bg-primary/10'
        }`}
      >
        <Icon className="w-4 h-4" aria-hidden="true" />
      </span>
      <span className="flex flex-col min-w-0 justify-center">
        <span className={`text-[12px] font-medium leading-tight ${primary ? 'text-white' : 'text-foreground'}`}>{title}</span>
        <span className={`text-[10px] mt-0.5 leading-tight ${primary ? 'text-white/75' : 'text-muted'}`}>{hint}</span>
      </span>
    </button>
  );
}
