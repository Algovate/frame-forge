export interface ExtractedFrame {
  id: string;
  dataUrl: string;
  time: number;
  selected: boolean;
}

/** Categorical processing phase — the source of truth for "what is the app
 *  doing right now". UI should branch on this, not on the presentational
 *  process message string. */
export type ProcessingPhase = 'idle' | 'extracting' | 'deduping' | 'matting' | 'exporting' | 'batch-cropping';
