export interface ExtractedFrame {
  id: string;
  dataUrl: string;
  /** Original (pre-matte) image URL. Matting always re-runs from this so repeated
   *  passes stay idempotent; a manual editor edit clears it (the edited image
   *  becomes the new matting source). Invariant: pixel-aligned with `dataUrl`. */
  sourceDataUrl?: string;
  /** Decoded pixel dimensions of `dataUrl`. Any transform that changes `dataUrl`'s
   *  dimensions (extract, crop, editor save) must update both fields together. */
  width?: number;
  height?: number;
  time: number;
  selected: boolean;
}

export type StickerSourceKind = 'gif' | 'video' | 'static-image' | 'static-images-batch';

export type MattingMode = 'edge-key' | 'conservative' | 'balanced';

export interface WechatReadiness {
  selectedCount: number;
  durationMs: number;
  isSquare: boolean;
  isWechatSize: boolean;
  hasFrames: boolean;
  estimatedSizeBytes?: number;
  actualSizeBytes?: number;
  messages: string[];
}

/** Categorical processing phase — the source of truth for "what is the app
 *  doing right now". UI should branch on this, not on the presentational
 *  process message string. */
export type ProcessingPhase = 'idle' | 'extracting' | 'deduping' | 'matting' | 'exporting' | 'batch-cropping';
