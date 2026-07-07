export interface ExtractedFrame {
  id: string;
  dataUrl: string;
  time: number;
  selected: boolean;
}

export type StickerSourceKind = 'gif' | 'video' | 'static-image';

export interface CaptionSettings {
  enabled: boolean;
  text: string;
  fontSize: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  position: 'top' | 'middle' | 'bottom';
}

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
