import type { AssetLibraryItem } from '../types';
import type { SplitVideoPart } from './ffmpegSpliter';
import { randomId } from './media';

export function assetFromSplitPart(part: SplitVideoPart): AssetLibraryItem {
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

export function splitPartFromAsset(asset: AssetLibraryItem): SplitVideoPart {
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
