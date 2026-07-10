import { useCallback, useRef } from 'react';
import { Grid3X3, Inbox, Play, Trash2, Download, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProjectAsset } from '../../types';
import { HEADING } from '../ui';
import { downloadBlob } from '../../utils/exporters';
import { useObjectUrlMap } from './useObjectUrlMap';

interface AssetLibraryPanelProps {
  assets: ProjectAsset[];
  columns?: number;
  title?: string;
  resolutionLabel?: string;
  onUseAsset: (asset: ProjectAsset) => void;
  onUseAll?: (assets: ProjectAsset[]) => void;
  onRemoveAsset?: (id: string) => void;
  onClearAssets?: () => void;
  onAddImage?: (file: File) => void;
}

export function AssetLibraryPanel({
  assets,
  columns = 4,
  title,
  resolutionLabel,
  onUseAsset,
  onUseAll,
  onRemoveAsset,
  onClearAssets,
  onAddImage,
}: AssetLibraryPanelProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const getAssetKey = useCallback((asset: ProjectAsset) => asset.id, []);
  const getAssetBlob = useCallback((asset: ProjectAsset) => asset.blob, []);
  const assetUrls = useObjectUrlMap(assets, getAssetKey, getAssetBlob);
  const gridColumns = Math.max(1, Math.min(columns, 4));

  return (
    <div className="glass-panel rounded-card p-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className={`${HEADING} mb-0 flex items-center gap-1.5`}>
          <Grid3X3 className="w-5 h-5 text-primary" aria-hidden="true" /> {title ?? t('assets.library')}
        </h2>
        <div className="text-right leading-tight flex flex-col items-end">
          <div className="flex items-center gap-2">
            {onAddImage && (
              <>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onAddImage(file);
                  event.target.value = '';
                }} />
                <button type="button" onClick={() => imageInputRef.current?.click()} className="min-h-8 px-2 rounded-control text-primary hover:bg-primary/10 transition-colors" title={t('assets.add_image', 'Add image')}>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span className="sr-only">{t('assets.add_image', 'Add image')}</span>
                </button>
              </>
            )}
            <span className="text-[11px] font-mono text-foreground">{assets.length}</span>
            {onClearAssets && assets.length > 0 && (
              <button
                type="button"
                onClick={onClearAssets}
                className="text-muted hover:text-red-500 transition-colors p-0.5 rounded-sm"
                title={t('assets.clear_all', 'Clear All')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {resolutionLabel && <div className="text-[10px] font-mono text-muted">{resolutionLabel}</div>}
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-control border border-dashed border-hairline-strong bg-surface/25 px-4 text-center">
          <Inbox className="mb-2 h-6 w-6 text-muted" aria-hidden="true" />
          <p className="text-xs font-medium text-foreground">{t('assets.empty_title')}</p>
          <p className="mt-1 max-w-[180px] text-[11px] leading-relaxed text-muted">{t('assets.empty_desc')}</p>
        </div>
      ) : null}

      {assets.length > 0 && onUseAll && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => onUseAll(assets)}
            className="w-full min-h-[30px] rounded-control border border-primary/35 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
          >
            {t('assets.use_all')}
          </button>
        </div>
      )}

      {assets.length > 0 && (
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
        >
          {assets.map((asset, index) => (
            <AssetTile
              key={asset.id}
              asset={asset}
              index={index}
              previewUrl={assetUrls[asset.id]}
              useLabel={t('assets.use_asset')}
              onUseAsset={onUseAsset}
              onRemoveAsset={onRemoveAsset}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetTile({
  asset,
  index,
  previewUrl,
  useLabel,
  onUseAsset,
  onRemoveAsset,
}: {
  asset: ProjectAsset;
  index: number;
  previewUrl?: string;
  useLabel: string;
  onUseAsset: (asset: ProjectAsset) => void;
  onRemoveAsset?: (id: string) => void;
}) {
  const position = asset.row !== undefined && asset.col !== undefined ? `${asset.row + 1},${asset.col + 1}` : `${index + 1}`;
  const { t } = useTranslation();

  return (
    <div className="group relative aspect-square overflow-hidden rounded-[8px] border border-hairline bg-black shadow-card transition-colors hover:border-primary/60 focus-within:border-primary">
      <button
        type="button"
        onClick={() => onUseAsset(asset)}
        aria-label={`${useLabel} ${position}`}
        title={asset.name}
        className="absolute inset-0 w-full h-full text-left"
      >
        {previewUrl && asset.kind === 'image' ? (
          <img
            src={previewUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : previewUrl ? (
          <video
            src={previewUrl}
            muted
            playsInline
            preload="metadata"
            loop
            onMouseEnter={(e) => void e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 opacity-0 transition-all duration-150 group-hover:bg-black/45 group-hover:opacity-100 focus-visible:bg-black/45 focus-visible:opacity-100 pointer-events-none">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white shadow-pop">
            <Play className="h-4 w-4 fill-current" />
          </span>
          <span className="text-[10px] font-medium text-white">{position}</span>
        </div>
      </button>

      <span className="absolute left-1 top-1 rounded-[4px] bg-background/70 px-1 text-[9px] font-mono text-white/80 opacity-80 backdrop-blur-sm transition-opacity group-hover:opacity-0 pointer-events-none">
        {position}
      </span>

      <div className="absolute right-1 top-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onRemoveAsset && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemoveAsset(asset.id); }}
            className="w-6 h-6 rounded-full bg-black/60 text-white hover:bg-red-500 flex items-center justify-center backdrop-blur-sm transition-colors"
            title={t('assets.delete', 'Delete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            downloadBlob(asset.blob, asset.name || `asset-${asset.id}.mp4`);
          }}
          className="w-6 h-6 rounded-full bg-black/60 text-white hover:bg-primary flex items-center justify-center backdrop-blur-sm transition-colors"
          title={t('assets.download', 'Download')}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      {asset.status && asset.status !== 'queued' && (
        <span className={`absolute right-1 bottom-1 rounded-full w-2.5 h-2.5 border border-black/50 pointer-events-none ${
          asset.status === 'error' ? 'bg-red-500' :
          asset.status === 'edited' ? 'bg-green-500' :
          'bg-yellow-500 animate-pulse'
        }`} title={asset.errorMessage || t(`clips.status_${asset.status}`)} />
      )}
    </div>
  );
}
