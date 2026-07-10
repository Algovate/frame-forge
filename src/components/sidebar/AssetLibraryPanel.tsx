import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Grid3X3, Inbox, Film, Trash2, Download, Plus, Pencil, Scissors, Search, X, CheckSquare, Square, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProjectAsset } from '../../types';
import { getBatchStickerEligibility, getSelectedAssets, getVisibleAssets, type AssetLibraryFilter, type AssetUseTarget } from '../../utils/assets';
import { HEADING } from '../ui';
import { downloadBlob } from '../../utils/exporters';
import { useObjectUrlMap } from './useObjectUrlMap';

interface AssetLibraryPanelProps {
  assets: ProjectAsset[];
  columns?: number;
  title?: string;
  resolutionLabel?: string;
  onUseAsset: (asset: ProjectAsset) => void;
  getUseTarget?: (asset: ProjectAsset) => AssetUseTarget;
  onUseSelected?: (assets: ProjectAsset[]) => void;
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
  getUseTarget,
  onUseSelected,
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
  const [filter, setFilter] = useState<AssetLibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const deferredQuery = useDeferredValue(query);
  const visibleAssets = useMemo(
    () => getVisibleAssets(assets, filter, deferredQuery),
    [assets, filter, deferredQuery],
  );
  const isFiltered = filter !== 'all' || Boolean(query.trim());
  const selectedAssets = useMemo(() => getSelectedAssets(assets, selectedIds), [assets, selectedIds]);
  const batchStickerEligibility = getBatchStickerEligibility(selectedAssets);
  const hasStaticImageSelection = batchStickerEligibility === 'ready';
  const allVisibleSelected = visibleAssets.length > 0 && visibleAssets.every(({ id }) => selectedIds.has(id));

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleVisibleSelection = useCallback(() => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) visibleAssets.forEach(({ id }) => next.delete(id));
      else visibleAssets.forEach(({ id }) => next.add(id));
      return next;
    });
  }, [allVisibleSelected, visibleAssets]);

  const exitSelectionMode = useCallback(() => {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }, []);

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
            <span className="text-[11px] font-mono text-foreground">{isFiltered ? `${visibleAssets.length}/${assets.length}` : assets.length}</span>
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

      {assets.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => isSelecting ? exitSelectionMode() : setIsSelecting(true)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-control border px-2 text-[11px] font-medium transition-colors ${isSelecting ? 'border-primary/40 bg-primary/10 text-primary' : 'border-hairline text-muted hover:border-primary/40 hover:text-foreground'}`} aria-pressed={isSelecting}>
              {isSelecting ? <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" /> : <Square className="h-3.5 w-3.5" aria-hidden="true" />}
              {t(isSelecting ? 'assets.done_selecting' : 'assets.select_assets')}
            </button>
            {isSelecting && visibleAssets.length > 0 && (
              <button type="button" onClick={toggleVisibleSelection} className="min-h-8 text-[11px] font-medium text-primary hover:underline">
                {t(allVisibleSelected ? 'assets.clear_visible' : 'assets.select_visible')}
              </button>
            )}
          </div>
          {isSelecting && selectedAssets.length > 0 && (
            <div className="mb-3 rounded-control border border-hairline bg-surface p-2" role="region" aria-label={t('assets.batch_actions')}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-foreground">{t('assets.selected_count', { count: selectedAssets.length })}</span>
                <button type="button" onClick={exitSelectionMode} className="text-[10px] text-muted hover:text-foreground">{t('assets.clear_selection')}</button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {onUseSelected && hasStaticImageSelection && (
                  <button type="button" onClick={() => onUseSelected(selectedAssets)} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-control bg-primary px-1 text-[10px] font-semibold text-white hover:bg-primary-hover" title={t('assets.batch_make_stickers')}>
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">{t('assets.batch_make_stickers')}</span>
                  </button>
                )}
                <button type="button" onClick={() => selectedAssets.forEach((asset) => downloadBlob(asset.blob, asset.name || `asset-${asset.id}.mp4`))} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-control border border-hairline text-muted hover:text-foreground" title={t('assets.download_selected')}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">{t('assets.download_selected')}</span>
                </button>
                {onRemoveAsset && (
                  <button type="button" onClick={() => {
                    if (!window.confirm(t('assets.confirm_delete_selected', { count: selectedAssets.length }))) return;
                    selectedAssets.forEach(({ id }) => onRemoveAsset(id));
                    exitSelectionMode();
                  }} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-control border border-red-200 text-red-600 hover:bg-red-50" title={t('assets.delete_selected')}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">{t('assets.delete_selected')}</span>
                  </button>
                )}
              </div>
              {onUseSelected && batchStickerEligibility === 'requires-static-images' && (
                <p className="mt-2 text-[10px] leading-relaxed text-muted">
                  {t('assets.batch_static_only_hint')}
                </p>
              )}
            </div>
          )}
          <div className="mb-3 space-y-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('assets.search_placeholder')}
                aria-label={t('assets.search_label')}
                className="h-8 w-full rounded-control border border-hairline bg-surface py-1 pl-8 pr-7 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted hover:bg-surface-hover hover:text-foreground" aria-label={t('assets.clear_search')}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </label>
            <div className="grid grid-cols-3 rounded-control border border-hairline bg-background p-0.5" role="group" aria-label={t('assets.filter_label')}>
              {(['all', 'image', 'motion'] as const).map((value) => (
                <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`min-h-7 rounded-[6px] px-1 text-[10px] font-medium transition-colors ${filter === value ? 'bg-surface text-primary shadow-pop' : 'text-muted hover:text-foreground'}`}>
                  {t(`assets.filter_${value}`)}
                </button>
              ))}
            </div>
          </div>
          {visibleAssets.length === 0 ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center rounded-control border border-dashed border-hairline px-4 text-center">
              <p className="text-xs font-medium text-foreground">{t('assets.no_results_title')}</p>
              <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="mt-1 text-[11px] text-primary hover:underline">{t('assets.reset_filters')}</button>
            </div>
          ) : (
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
        >
          {visibleAssets.map((asset, index) => (
            <AssetTile
              key={asset.id}
              asset={asset}
              index={index}
              previewUrl={assetUrls[asset.id]}
              useLabel={t('assets.use_asset')}
              useTarget={getUseTarget?.(asset) ?? 'studio'}
              isSelecting={isSelecting}
              isSelected={selectedIds.has(asset.id)}
              onToggleSelected={toggleSelection}
              onUseAsset={onUseAsset}
              onRemoveAsset={onRemoveAsset}
            />
          ))}
        </div>
          )}
        </>
      )}
    </div>
  );
}

function AssetTile({
  asset,
  index,
  previewUrl,
  useLabel,
  useTarget,
  onUseAsset,
  onRemoveAsset,
  isSelecting,
  isSelected,
  onToggleSelected,
}: {
  asset: ProjectAsset;
  index: number;
  previewUrl?: string;
  useLabel: string;
  useTarget: AssetUseTarget;
  onUseAsset: (asset: ProjectAsset) => void;
  onRemoveAsset?: (id: string) => void;
  isSelecting: boolean;
  isSelected: boolean;
  onToggleSelected: (id: string) => void;
}) {
  const position = asset.row !== undefined && asset.col !== undefined ? `${asset.row + 1},${asset.col + 1}` : `${index + 1}`;
  const { t } = useTranslation();
  const ActionIcon = useTarget === 'canvas-editor' ? Pencil : useTarget === 'splitter' ? Scissors : Film;
  const actionLabel = useTarget === 'canvas-editor'
    ? t('assets.edit_image')
    : useTarget === 'splitter'
      ? t('assets.split_video')
      : t('assets.make_sticker');

  return (
    <div className="group relative aspect-square overflow-hidden rounded-[8px] border border-hairline bg-black shadow-card transition-colors hover:border-primary/60 focus-within:border-primary">
      {isSelecting && (
        <button type="button" onClick={() => onToggleSelected(asset.id)} aria-pressed={isSelected} aria-label={t(isSelected ? 'assets.unselect_asset' : 'assets.select_asset', { name: asset.name || position })} className={`absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${isSelected ? 'border-primary bg-primary text-white' : 'border-white/50 bg-black/55 text-white hover:border-white'}`}>
          {isSelected && <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      )}
      <button
        type="button"
        onClick={() => onUseAsset(asset)}
        aria-label={`${actionLabel}: ${asset.name || `${useLabel} ${position}`}`}
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
            <ActionIcon className="h-4 w-4" />
          </span>
          <span className="text-[10px] font-medium text-white">{actionLabel}</span>
        </div>
      </button>

      <span className={`absolute ${isSelecting ? 'left-8' : 'left-1'} top-1 rounded-[4px] bg-background/70 px-1 text-[9px] font-mono text-white/80 opacity-80 backdrop-blur-sm transition-opacity group-hover:opacity-0 pointer-events-none`}>
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
