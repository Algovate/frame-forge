import type { ProjectAsset } from '../types';
import type { SplitVideoPart } from './ffmpegSplitter';
import { randomId } from './media';

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
