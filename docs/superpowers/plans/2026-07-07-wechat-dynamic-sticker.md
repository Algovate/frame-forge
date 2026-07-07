# WeChat Dynamic Sticker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Frame Forge into a WeChat-focused dynamic sticker maker for video and GIF sources, with 240 x 240 GIF-first export, caption rendering, preview, and readiness checks.

**Architecture:** Keep the existing frame-sequence model and React three-panel layout. Add small utilities for media classification, WeChat output constants, caption rendering, and export readiness so behavior is testable outside the UI. Update components around those utilities instead of replacing the current editor or extraction pipeline.

**Tech Stack:** React 19, TypeScript, Vite, Canvas 2D API, gif.js, gifuct-js, rc-slider, lucide-react, Vitest + jsdom.

---

## File Structure

- Modify `src/types/index.ts`: add source kind, caption, and readiness types.
- Create `src/utils/wechat.ts`: WeChat defaults and readiness helpers.
- Create `src/utils/wechat.test.ts`: unit tests for readiness and export defaults.
- Create `src/utils/captions.ts`: caption rendering helpers for selected frames.
- Create `src/utils/captions.test.ts`: unit tests for caption defaults and selected-frame scope.
- Modify `src/utils/media.ts`: add media classification for video/GIF/static-image rejection.
- Create `src/utils/media.test.ts`: tests for video/GIF/static image classification.
- Create `src/utils/canvasFit.ts`: aspect-ratio-safe rendering into the WeChat square canvas.
- Create `src/utils/canvasFit.test.ts`: unit tests for contain/cover draw rectangles.
- Modify `src/utils/exporters.ts`: support GIF export result metadata and explicit WeChat dimensions.
- Modify `src/components/LeftSidebar.tsx`: update source copy, accept list, static-image rejection, and source-specific CTA.
- Modify `src/components/FrameGallery.tsx`: relabel frame workspace and add creator-facing cleanup labels.
- Modify `src/components/AnimationPreview.tsx`: accept GIF delay, preview selected frames at export timing, and show duration.
- Modify `src/components/RightSidebar.tsx`: add caption panel, readiness panel, GIF-first export, and advanced exports.
- Modify `src/App.tsx`: wire source classification, WeChat defaults, caption state, rendered-frame export, and readiness feedback.
- Modify `README.md`: document the WeChat dynamic sticker workflow.

## Task 1: Source Classification and WeChat Constants

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/utils/media.ts`
- Create: `src/utils/media.test.ts`
- Create: `src/utils/canvasFit.ts`
- Create: `src/utils/canvasFit.test.ts`
- Create: `src/utils/wechat.ts`
- Create: `src/utils/wechat.test.ts`

- [ ] **Step 1: Add failing media classification tests**

Create `src/utils/media.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyStickerSource } from './media';

const file = (name: string, type: string) => new File(['x'], name, { type });

describe('classifyStickerSource', () => {
  it('classifies GIF sources separately from static images', () => {
    expect(classifyStickerSource(file('reaction.gif', 'image/gif'))).toBe('gif');
    expect(classifyStickerSource(file('reaction.GIF', ''))).toBe('gif');
  });

  it('classifies supported videos by MIME type or extension fallback', () => {
    expect(classifyStickerSource(file('clip.mp4', 'video/mp4'))).toBe('video');
    expect(classifyStickerSource(file('clip.mov', ''))).toBe('video');
  });

  it('rejects static images for the P0 dynamic sticker flow', () => {
    expect(classifyStickerSource(file('still.png', 'image/png'))).toBe('static-image');
    expect(classifyStickerSource(file('still.webp', 'image/webp'))).toBe('static-image');
  });

  it('returns null for unsupported files', () => {
    expect(classifyStickerSource(file('notes.txt', 'text/plain'))).toBeNull();
  });
});
```

- [ ] **Step 2: Add failing WeChat readiness tests**

Create `src/utils/wechat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WECHAT_STICKER_PRESET, getWechatReadiness } from './wechat';
import type { ExtractedFrame } from '../types';

const frames: ExtractedFrame[] = [
  { id: 'a', dataUrl: 'a', time: 0, selected: true },
  { id: 'b', dataUrl: 'b', time: 1, selected: false },
  { id: 'c', dataUrl: 'c', time: 2, selected: true },
];

describe('WECHAT_STICKER_PRESET', () => {
  it('defaults to a 240 x 240 GIF sticker export', () => {
    expect(WECHAT_STICKER_PRESET).toMatchObject({
      width: 240,
      height: 240,
      gifDelay: 100,
    });
  });
});

describe('getWechatReadiness', () => {
  it('reports selected frame count, duration, and dimension status', () => {
    expect(getWechatReadiness(frames, 240, 240, 100)).toEqual({
      selectedCount: 2,
      durationMs: 200,
      isSquare: true,
      isWechatSize: true,
      hasFrames: true,
      messages: ['Ready for WeChat GIF export.'],
    });
  });

  it('reports actionable problems', () => {
    expect(getWechatReadiness(frames, 320, 240, 100).messages).toContain('Set output size to 240 x 240.');
    expect(getWechatReadiness([], 240, 240, 100).messages).toContain('Select at least one sticker frame.');
  });
});
```

- [ ] **Step 3: Add failing canvas fit tests**

Create `src/utils/canvasFit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getObjectFitRect } from './canvasFit';

describe('getObjectFitRect', () => {
  it('contains a wide source inside a square canvas without distortion', () => {
    expect(getObjectFitRect(480, 240, 240, 240, 'contain')).toEqual({
      dx: 0,
      dy: 60,
      dw: 240,
      dh: 120,
    });
  });

  it('covers a square canvas with a wide source without distortion', () => {
    expect(getObjectFitRect(480, 240, 240, 240, 'cover')).toEqual({
      dx: -120,
      dy: 0,
      dw: 480,
      dh: 240,
    });
  });
});
```

- [ ] **Step 4: Run tests and confirm failure**

Run:

```bash
npm run test -- src/utils/media.test.ts src/utils/wechat.test.ts src/utils/canvasFit.test.ts
```

Expected: FAIL because the new helpers do not exist.

- [ ] **Step 5: Add shared types**

Modify `src/types/index.ts`:

```ts
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
```

- [ ] **Step 6: Implement media classification**

Modify `src/utils/media.ts`:

```ts
import type { StickerSourceKind } from '../types';

const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv', 'avi', 'flv', 'wmv', '3gp', 'ts'];
const STATIC_IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];

export const classifyStickerSource = (file: File): StickerSourceKind | null => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.type === 'image/gif' || ext === 'gif') return 'gif';
  if (file.type.startsWith('video/') || VIDEO_EXT.includes(ext)) return 'video';
  if ((file.type.startsWith('image/') && file.type !== 'image/gif') || STATIC_IMAGE_EXT.includes(ext)) {
    return 'static-image';
  }
  return null;
};
```

- [ ] **Step 7: Implement WeChat constants and readiness helper**

Create `src/utils/wechat.ts`:

```ts
import type { ExtractedFrame, WechatReadiness } from '../types';

export const WECHAT_STICKER_PRESET = {
  width: 240,
  height: 240,
  gifDelay: 100,
} as const;

export const getSelectedFrameCount = (frames: ExtractedFrame[]) =>
  frames.filter((frame) => frame.selected).length;

export const getWechatReadiness = (
  frames: ExtractedFrame[],
  width: number,
  height: number,
  gifDelay: number,
  actualSizeBytes?: number,
): WechatReadiness => {
  const selectedCount = getSelectedFrameCount(frames);
  const isSquare = width === height;
  const isWechatSize = width === WECHAT_STICKER_PRESET.width && height === WECHAT_STICKER_PRESET.height;
  const messages: string[] = [];

  if (selectedCount === 0) messages.push('Select at least one sticker frame.');
  if (!isWechatSize) messages.push('Set output size to 240 x 240.');
  if (!isSquare) messages.push('Use a square canvas for WeChat stickers.');
  if (messages.length === 0) messages.push('Ready for WeChat GIF export.');

  return {
    selectedCount,
    durationMs: selectedCount * gifDelay,
    isSquare,
    isWechatSize,
    hasFrames: selectedCount > 0,
    actualSizeBytes,
    messages,
  };
};
```

- [ ] **Step 8: Implement aspect-ratio-safe canvas fitting**

Create `src/utils/canvasFit.ts`:

```ts
import { loadImage } from './media';

export type ObjectFitMode = 'contain' | 'cover';

export interface DrawRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export const getObjectFitRect = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: ObjectFitMode,
): DrawRect => {
  const scale = mode === 'cover'
    ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const dw = Math.round(sourceWidth * scale);
  const dh = Math.round(sourceHeight * scale);
  return {
    dx: Math.round((targetWidth - dw) / 2),
    dy: Math.round((targetHeight - dh) / 2),
    dw,
    dh,
  };
};

export const fitImageToCanvas = async (
  dataUrl: string,
  width: number,
  height: number,
  mode: ObjectFitMode = 'contain',
  background = 'transparent',
): Promise<string> => {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  const rect = getObjectFitRect(image.width, image.height, width, height, mode);
  ctx.drawImage(image, rect.dx, rect.dy, rect.dw, rect.dh);
  return canvas.toDataURL('image/png');
};
```

- [ ] **Step 9: Verify tests**

Run:

```bash
npm run test -- src/utils/media.test.ts src/utils/wechat.test.ts src/utils/canvasFit.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 10: Commit**

```bash
git add src/types/index.ts src/utils/media.ts src/utils/media.test.ts src/utils/wechat.ts src/utils/wechat.test.ts src/utils/canvasFit.ts src/utils/canvasFit.test.ts
git commit -m "feat: add wechat sticker source helpers"
```

## Task 2: Reframe Import and Workspace UI Around Video/GIF Stickers

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/LeftSidebar.tsx`
- Modify: `src/components/FrameGallery.tsx`

- [ ] **Step 1: Replace local source classification in App**

In `src/App.tsx`, remove the local `VIDEO_EXT` and `classifyMedia` definitions. Import:

```ts
import { classifyStickerSource } from './utils/media';
```

Update `acceptFile`:

```ts
const acceptFile = useCallback(
  (file?: File | null) => {
    if (!file) return;
    const kind = classifyStickerSource(file);
    if (kind === 'gif' || kind === 'video') {
      revokeFrameUrls(frames);
      setFrames([]);
      setSourceFile(file);
      pushToast('success', `Loaded ${file.name}`);
      return;
    }
    if (kind === 'static-image') {
      pushToast('info', 'Static image animation is not supported in this version. Use a video or GIF for dynamic stickers.');
      return;
    }
    pushToast('error', 'Unsupported file. Use a video or GIF.');
  },
  [pushToast, frames],
);
```

Update `processSource` to use `classifyStickerSource(sourceFile)` and reject `'static-image'`.

Add a derived `sourceKind` in `App.tsx`:

```ts
const sourceKind = sourceFile ? classifyStickerSource(sourceFile) : null;
```

Pass it to `LeftSidebar`:

```tsx
sourceKind={sourceKind}
```

- [ ] **Step 2: Update LeftSidebar accepted files and copy**

In `src/components/LeftSidebar.tsx`:

Add the prop:

```ts
sourceKind: StickerSourceKind | null;
```

Import `StickerSourceKind` from `../types`.

- Change heading text from `Input source` to `Sticker source`.
- Change empty drop copy to `Drop a video or GIF`.
- Change parse heading from `Parse settings` to `Extraction settings`.
- Change the file input accept attribute to:

```tsx
accept="video/*, image/gif"
```

- Change the primary button label:

```tsx
{extracting ? 'Extracting...' : props.sourceKind === 'gif' ? 'Parse GIF frames' : 'Extract sticker frames'}
```

Use `props.sourceKind === 'video'` for video-specific preview and timeline controls so files classified by extension fallback still behave as videos.

- [ ] **Step 3: Update FrameGallery labels**

In `src/components/FrameGallery.tsx`:

- Change title from `Frames` to `Sticker frames`.
- Change empty state text to `No sticker frames yet`.
- Change helper text to `Load a video or GIF, then extract frames to begin.`
- Change `Similarity thresh:` to `Similarity:`.
- Change visible action labels:
  - `Find Loops` -> `Loop`
  - `Find Jumps` -> `Jumps`
  - `Find Duplicates` -> `Duplicates`

- [ ] **Step 4: Verify UI build**

Run:

```bash
npm run build
```

Expected: build passes.

- [ ] **Step 5: Manual checks**

Run:

```bash
npm run dev
```

Expected:

- Dropping a PNG shows the static-image unsupported info toast.
- Dropping a GIF enables `Parse GIF frames`.
- Dropping a video enables `Extract sticker frames`.
- No existing frame cleanup buttons disappear.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/LeftSidebar.tsx src/components/FrameGallery.tsx
git commit -m "feat: focus import workflow on dynamic stickers"
```

## Task 3: WeChat Preview and GIF-First Export

**Files:**
- Modify: `src/utils/exporters.ts`
- Modify: `src/components/AnimationPreview.tsx`
- Modify: `src/components/RightSidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update GIF exporter to return metadata**

Modify `src/utils/exporters.ts`:

```ts
export interface ExportResult {
  filename: string;
  sizeBytes: number;
}
```

Import the fit helper:

```ts
import { fitImageToCanvas } from './canvasFit';
```

Change `exportGIF` return type to:

```ts
export const exportGIF = async (
  frames: ExtractedFrame[],
  delay: number,
  w: number,
  h: number,
): Promise<ExportResult | null> => {
```

Return `null` when no frames are selected. In the `finished` handler:

```ts
const filename = 'wechat-sticker.gif';
downloadBlob(blob, filename);
resolve({ filename, sizeBytes: blob.size });
```

Keep ZIP and sprite-sheet behavior unchanged.

Replace the old GIF resize path with aspect-ratio-safe fitting:

```ts
const maybeFit = (dataUrl: string) => (w && h ? fitImageToCanvas(dataUrl, w, h, 'contain') : dataUrl);

for (const frame of selectedFrames) {
  const img = await loadImage(await maybeFit(frame.dataUrl));
  gif.addFrame(img, { delay });
}
```

Do not use the existing `resizeImage` helper for the WeChat GIF path, because it stretches non-square sources.

- [ ] **Step 2: Set WeChat defaults in App**

In `src/App.tsx`, import:

```ts
import { WECHAT_STICKER_PRESET } from './utils/wechat';
```

Initialize defaults:

```ts
const [gifDelay, setGifDelay] = useState<number>(WECHAT_STICKER_PRESET.gifDelay);
const [exportWidth, setExportWidth] = useState<number>(WECHAT_STICKER_PRESET.width);
const [exportHeight, setExportHeight] = useState<number>(WECHAT_STICKER_PRESET.height);
```

Update `handleExportGIF` to capture size metadata:

```ts
const result = await exportGIF(frames, gifDelay, exportWidth, exportHeight);
if (result) pushToast('success', `GIF ready (${Math.round(result.sizeBytes / 1024)} KB)`);
```

- [ ] **Step 3: Make preview use export timing**

Modify `src/components/AnimationPreview.tsx` props:

```ts
interface AnimationPreviewProps {
  frames: ExtractedFrame[];
  delayMs: number;
}
```

Remove local FPS slider state. Use `delayMs` for the timeout:

```ts
const safeDelay = Math.max(20, delayMs);
timeoutId = window.setTimeout(loop, safeDelay);
```

Change the top-right indicator to:

```tsx
{safeDelay} ms
```

Change the footer text to include duration:

```tsx
{selectedFrames.length} frames · {(selectedFrames.length * safeDelay / 1000).toFixed(1)}s
```

- [ ] **Step 4: Pass delay from RightSidebar**

Modify `src/components/RightSidebar.tsx`:

```tsx
<AnimationPreview frames={props.frames} delayMs={props.gifDelay} />
```

- [ ] **Step 5: Make GIF the primary export tab**

In `src/components/RightSidebar.tsx`:

- Initialize `exportTab` to `'gif'`.
- Reorder `EXPORT_TABS` so GIF appears first.
- Change GIF hint to `WeChat 240 x 240`.
- Move ZIP and Sprite into labels that read as secondary exports.

- [ ] **Step 6: Verify build and manual preview timing**

Run:

```bash
npm run build
```

Expected: build passes.

Manual check:

- GIF export defaults to 240 x 240 and downloads `wechat-sticker.gif`.
- Preview speed changes when the GIF delay input changes.

- [ ] **Step 7: Commit**

```bash
git add src/utils/exporters.ts src/components/AnimationPreview.tsx src/components/RightSidebar.tsx src/App.tsx
git commit -m "feat: default exports to wechat gif"
```

## Task 4: Caption Rendering for Selected Frames

**Files:**
- Create: `src/utils/captions.ts`
- Create: `src/utils/captions.test.ts`
- Modify: `src/components/RightSidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add failing caption tests**

Create `src/utils/captions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionSettings, ExtractedFrame } from '../types';
import { DEFAULT_CAPTION, applyCaptionToFrames } from './captions';
import { loadImage } from './media';

vi.mock('./media', () => ({
  loadImage: vi.fn(async () => ({ width: 240, height: 240 })),
}));

const frames: ExtractedFrame[] = [
  { id: 'a', dataUrl: 'frame-a', time: 0, selected: true },
  { id: 'b', dataUrl: 'frame-b', time: 1, selected: false },
];

const originalCreateElement = document.createElement.bind(document);

describe('DEFAULT_CAPTION', () => {
  it('uses high-contrast bottom sticker text by default', () => {
    expect(DEFAULT_CAPTION).toMatchObject({
      enabled: false,
      position: 'bottom',
      fillColor: '#ffffff',
      strokeColor: '#000000',
    });
  });
});

describe('applyCaptionToFrames', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'canvas') return originalCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          measureText: (text: string) => ({ width: text.length * 10 }),
          strokeText: vi.fn(),
          fillText: vi.fn(),
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          font: '',
          textAlign: 'center',
          textBaseline: 'alphabetic',
          lineJoin: 'round',
          strokeStyle: '',
          fillStyle: '',
          lineWidth: 0,
        }),
        toDataURL: () => 'data:image/png;base64,captioned',
      } as unknown as HTMLCanvasElement;
    });
  });

  it('does not render when caption is disabled or empty', async () => {
    const result = await applyCaptionToFrames(frames, DEFAULT_CAPTION);
    expect(result).toBe(frames);
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('renders captions only onto selected frames', async () => {
    const caption: CaptionSettings = { ...DEFAULT_CAPTION, enabled: true, text: 'OK' };
    const result = await applyCaptionToFrames(frames, caption);
    expect(result[0].dataUrl).toContain('data:image/png');
    expect(result[1]).toBe(frames[1]);
    expect(loadImage).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
npm run test -- src/utils/captions.test.ts
```

Expected: FAIL because `captions.ts` does not exist.

- [ ] **Step 3: Implement caption utility**

Create `src/utils/captions.ts`:

```ts
import type { CaptionSettings, ExtractedFrame } from '../types';
import { loadImage } from './media';

export const DEFAULT_CAPTION: CaptionSettings = {
  enabled: false,
  text: '',
  fontSize: 32,
  fillColor: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 5,
  position: 'bottom',
};

const getCaptionY = (position: CaptionSettings['position'], height: number, fontSize: number) => {
  if (position === 'top') return fontSize + 12;
  if (position === 'middle') return height / 2 + fontSize / 3;
  return height - 18;
};

const wrapCaptionText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const chars = [...text.trim()];
  const lines: string[] = [];
  let current = '';
  for (const char of chars) {
    const next = current + char;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
};

export const applyCaptionToFrames = async (
  frames: ExtractedFrame[],
  caption: CaptionSettings,
): Promise<ExtractedFrame[]> => {
  if (!caption.enabled || !caption.text.trim()) return frames;

  return Promise.all(
    frames.map(async (frame) => {
      if (!frame.selected) return frame;
      const image = await loadImage(frame.dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return frame;

      ctx.drawImage(image, 0, 0);
      ctx.font = `700 ${caption.fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      const lines = wrapCaptionText(ctx, caption.text, canvas.width - 24);
      const lineHeight = Math.round(caption.fontSize * 1.15);
      const firstY = getCaptionY(caption.position, canvas.height, caption.fontSize) - ((lines.length - 1) * lineHeight) / 2;

      lines.forEach((line, index) => {
        const y = firstY + index * lineHeight;
        ctx.strokeStyle = caption.strokeColor;
        ctx.lineWidth = caption.strokeWidth;
        ctx.strokeText(line, canvas.width / 2, y);
        ctx.fillStyle = caption.fillColor;
        ctx.fillText(line, canvas.width / 2, y);
      });

      return { ...frame, dataUrl: canvas.toDataURL('image/png') };
    }),
  );
};
```

- [ ] **Step 4: Add caption controls to RightSidebar**

Modify `src/components/RightSidebar.tsx` props:

```ts
caption: CaptionSettings;
setCaption: (caption: CaptionSettings) => void;
onApplyCaption: () => void;
```

Import `CaptionSettings`.

Add a panel before cleanup/export:

```tsx
<div className="glass-panel rounded-card p-5">
  <h2 className={HEADING}>Caption</h2>
  <div className="space-y-3">
    <label className="flex items-center gap-2 text-sm text-muted">
      <input
        type="checkbox"
        checked={props.caption.enabled}
        onChange={(e) => props.setCaption({ ...props.caption, enabled: e.target.checked })}
      />
      Render caption on export
    </label>
    <input
      value={props.caption.text}
      onChange={(e) => props.setCaption({ ...props.caption, text: e.target.value })}
      placeholder="Sticker text"
      className={FIELD}
    />
    <div className="grid grid-cols-3 gap-2">
      {(['top', 'middle', 'bottom'] as const).map((position) => (
        <button
          key={position}
          type="button"
          onClick={() => props.setCaption({ ...props.caption, position })}
          className={`min-h-[34px] rounded-control border text-xs ${props.caption.position === position ? 'border-primary text-primary' : 'border-hairline text-muted'}`}
        >
          {position}
        </button>
      ))}
    </div>
    <button type="button" onClick={props.onApplyCaption} disabled={props.isProcessing} className="w-full min-h-[40px] rounded-control bg-primary text-white text-sm font-medium disabled:opacity-50">
      Apply to selected frames
    </button>
  </div>
</div>
```

Keep this UI concise; add size/color/stroke controls after the core caption path works.

- [ ] **Step 5: Wire caption state in App**

In `src/App.tsx`, import:

```ts
import { DEFAULT_CAPTION, applyCaptionToFrames } from './utils/captions';
```

Add state:

```ts
const [caption, setCaption] = useState(DEFAULT_CAPTION);
```

Add handler:

```ts
const handleApplyCaption = () => {
  if (!caption.enabled || !caption.text.trim()) return pushToast('info', 'Enter caption text first');
  runProcessing('exporting', 'Rendering caption...', async () => {
    setFrames(await applyCaptionToFrames(frames, caption));
    pushToast('success', 'Caption applied to selected frames');
  }, 'Caption rendering failed');
};
```

Before GIF export, render captions into a temporary frame list instead of mutating frames:

```ts
const exportFrames = caption.enabled && caption.text.trim()
  ? await applyCaptionToFrames(frames, caption)
  : frames;
const result = await exportGIF(exportFrames, gifDelay, exportWidth, exportHeight);
```

Pass `caption`, `setCaption`, and `onApplyCaption` to `RightSidebar`.

- [ ] **Step 6: Verify tests and build**

Run:

```bash
npm run test -- src/utils/captions.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 7: Manual caption checks**

Run:

```bash
npm run dev
```

Expected:

- Caption can be applied to selected frames.
- Export with caption enabled renders text into the downloaded GIF.
- Unselected frames remain untouched by `Apply to selected frames`.

- [ ] **Step 8: Commit**

```bash
git add src/utils/captions.ts src/utils/captions.test.ts src/components/RightSidebar.tsx src/App.tsx
git commit -m "feat: add sticker caption rendering"
```

## Task 5: WeChat Readiness Panel and Advanced Export Cleanup

**Files:**
- Modify: `src/components/RightSidebar.tsx`
- Modify: `src/App.tsx`
- Modify: `README.md`

- [ ] **Step 1: Add readiness state to App**

In `src/App.tsx`, import:

```ts
import { getWechatReadiness } from './utils/wechat';
```

Add state:

```ts
const [lastGifSizeBytes, setLastGifSizeBytes] = useState<number | undefined>();
```

Compute readiness:

```ts
const readiness = getWechatReadiness(frames, exportWidth, exportHeight, gifDelay, lastGifSizeBytes);
```

When source file changes or frames are regenerated, clear `lastGifSizeBytes`.

When GIF export completes:

```ts
if (result) setLastGifSizeBytes(result.sizeBytes);
```

Pass `readiness` to `RightSidebar`.

- [ ] **Step 2: Add readiness panel**

Modify `src/components/RightSidebar.tsx` props:

```ts
readiness: WechatReadiness;
```

Import `WechatReadiness`.

Add a panel above Export:

```tsx
<div className="glass-panel rounded-card p-5">
  <h2 className={HEADING}>WeChat check</h2>
  <div className="grid grid-cols-2 gap-2 text-xs">
    <div className="rounded-control border border-hairline p-2">
      <span className="block text-muted">Size</span>
      <span className="font-mono">{props.exportWidth} x {props.exportHeight}</span>
    </div>
    <div className="rounded-control border border-hairline p-2">
      <span className="block text-muted">Frames</span>
      <span className="font-mono">{props.readiness.selectedCount}</span>
    </div>
    <div className="rounded-control border border-hairline p-2">
      <span className="block text-muted">Duration</span>
      <span className="font-mono">{(props.readiness.durationMs / 1000).toFixed(1)}s</span>
    </div>
    <div className="rounded-control border border-hairline p-2">
      <span className="block text-muted">Last GIF</span>
      <span className="font-mono">{props.readiness.actualSizeBytes ? `${Math.round(props.readiness.actualSizeBytes / 1024)} KB` : '-'}</span>
    </div>
  </div>
  <ul className="mt-3 space-y-1 text-xs text-muted">
    {props.readiness.messages.map((message) => (
      <li key={message}>{message}</li>
    ))}
  </ul>
</div>
```

- [ ] **Step 3: Collapse secondary exports visually**

In `src/components/RightSidebar.tsx`:

- Keep GIF as the default visible tab.
- Put ZIP and Sprite under a compact `Advanced exports` details block, or keep them as secondary tabs with subdued labels if avoiding a larger component change.
- Do not remove `onExportZIP` or `onExportSpriteSheet`.

- [ ] **Step 4: Update README**

Modify `README.md` feature list:

```md
- Create WeChat dynamic stickers from videos and GIFs.
- Use a 240 x 240 WeChat sticker export preset.
- Preview selected frames at the configured GIF delay.
- Add high-contrast caption text to selected frames.
- Check size, frame count, duration, and last export size before exporting.
```

Add a workflow section:

```md
## WeChat Dynamic Sticker Workflow

1. Import a video or GIF.
2. Extract or parse sticker frames.
3. Crop or fit the result to 240 x 240.
4. Clean unwanted frames.
5. Add captions if needed.
6. Check the WeChat readiness panel.
7. Export `wechat-sticker.gif`.
```

Mention that static image animation is not part of the current dynamic-sticker workflow.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run test
npm run build
```

Expected: all tests and production build pass.

- [ ] **Step 6: Manual end-to-end checks**

Run:

```bash
npm run dev
```

Expected:

- Video flow can extract frames and export `wechat-sticker.gif`.
- GIF flow can parse frames and export `wechat-sticker.gif`.
- PNG/JPG/WebP import gives a clear unsupported-for-dynamic message.
- Readiness panel updates when frame selection, size, or delay changes.
- ZIP and sprite-sheet exports are still reachable.

- [ ] **Step 7: Commit**

```bash
git add src/components/RightSidebar.tsx src/App.tsx README.md
git commit -m "feat: add wechat readiness workflow"
```

## Final Verification

- [ ] Run:

```bash
npm run test
npm run build
```

- [ ] Start the dev server:

```bash
npm run dev
```

- [ ] Verify with a browser:

  - The app loads without console errors.
  - Static image files are rejected with the P0 dynamic-sticker message.
  - GIF parsing still works.
  - Video extraction still works.
  - Caption rendering works on selected frames.
  - Preview uses GIF delay.
  - GIF export defaults to 240 x 240 and downloads `wechat-sticker.gif`.
  - ZIP and sprite-sheet export remain available.
