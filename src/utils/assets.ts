import type { ProjectAsset } from '../types';
import type { SplitVideoPart } from './ffmpegSplitter';
import { randomId } from './media';

export type AssetUseTarget = 'canvas-editor' | 'studio' | 'splitter';
export type AssetLibraryFilter = 'all' | 'image' | 'motion';
export type BatchStickerEligibility = 'ready' | 'requires-static-images';

export function getSelectedAssets(assets: ProjectAsset[], selectedIds: ReadonlySet<string>): ProjectAsset[] {
  return assets.filter(({ id }) => selectedIds.has(id));
}

/** The frame appender deliberately accepts a batch of still images only.
 * GIFs remain motion assets even though their MIME type starts with image/. */
export function isStaticImageBatch(assets: ProjectAsset[]): boolean {
  return getBatchStickerEligibility(assets) === 'ready';
}

/** Surface the product constraint separately from the boolean so controls can
 * explain why a mixed or motion selection cannot become one frame sequence. */
export function getBatchStickerEligibility(assets: ProjectAsset[]): BatchStickerEligibility {
  return assets.length > 0 && assets.every((asset) => (
    asset.kind === 'image' && asset.file.type !== 'image/gif'
  )) ? 'ready' : 'requires-static-images';
}

/** Return a new, newest-first view for the asset library without mutating the
 * store collection. `motion` intentionally groups source videos and extracted
 * video parts because both resume an animated workflow. */
export function getVisibleAssets(
  assets: ProjectAsset[],
  filter: AssetLibraryFilter,
  query: string,
): ProjectAsset[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return assets
    .filter((asset) => (
      filter === 'all'
      || (filter === 'image' && asset.kind === 'image' && asset.file.type !== 'image/gif')
      || (filter === 'motion' && (asset.kind !== 'image' || asset.file.type === 'image/gif'))
    ))
    .filter((asset) => !normalizedQuery || asset.name.toLocaleLowerCase().includes(normalizedQuery))
    .toSorted((left, right) => right.createdAt - left.createdAt);
}

/** Resolve the next workspace from the asset itself and the current task.
 * Still images are refined directly; animated sources belong in the sticker
 * flow. Videos retain the splitter as their primary destination when the user
 * is already working in that tool. */
export function getAssetUseTarget(
  asset: ProjectAsset,
  activeTool: 'studio' | 'splitter' | 'canvas-editor',
): AssetUseTarget {
  if (asset.kind === 'image' && asset.file.type !== 'image/gif') return 'canvas-editor';
  if (activeTool === 'splitter' && asset.kind !== 'image') return 'splitter';
  return 'studio';
}

export function assetFromSplitPart(part: SplitVideoPart): ProjectAsset {
  return {
    id: randomId('asset'),
    kind: 'split-video',
    name: part.filename,
    blob: part.blob,
    file: part.file,
    row: part.row,
    col: part.col,
    width: part.width,
    height: part.height,
    createdAt: Date.now(),
  };
}

export function splitPartFromAsset(asset: ProjectAsset): SplitVideoPart {
  return {
    row: asset.row ?? 0,
    col: asset.col ?? 0,
    filename: asset.name,
    blob: asset.blob,
    file: asset.file,
    width: asset.width,
    height: asset.height,
  };
}

/** Build an asset-library item from a raw file. Dimensions are left as 0:
 *  nothing in the library consumes them — the splitter re-probes via
 *  `getVideoDimensions` when a clip is loaded for splitting — so probing on
 *  every import would only add a metadata load to the import path. Compute
 *  them lazily at the point of use if a consumer ever needs them. */
export function assetFromFile(file: File): ProjectAsset {
  return {
    id: randomId('asset'),
    kind: file.type.startsWith('image/') ? 'image' : 'video',
    name: file.name,
    blob: file,
    file,
    width: 0,
    height: 0,
    createdAt: Date.now(),
  };
}
