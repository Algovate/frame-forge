# Frame Editor Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frame editor reliable for animation-frame workflows by fixing correctness bugs, adding selected-frame batch operations, and improving precision controls.

**Architecture:** Keep the existing modal-based editor, but move reusable coordinate and image operations into utility functions so canvas behavior is testable. Add small focused tests around crop mapping, bounds handling, and batch-processing scope before expanding UI features.

**Tech Stack:** React 19, TypeScript, Vite, Canvas 2D API, react-image-crop, rc-slider, lucide-react, Vitest + jsdom.

---

## File Structure

- Modify `package.json`: add test scripts and Vitest/jsdom dependencies.
- Create `vitest.config.ts`: configure jsdom tests for browser-like canvas utility behavior.
- Create `src/test/setup.ts`: shared test setup and light DOM/canvas guards.
- Modify `src/utils/canvasEditor.ts`: add crop coordinate normalization and bounds helpers.
- Create `src/utils/canvasEditor.test.ts`: unit tests for coordinate mapping and bounds checks.
- Modify `src/utils/processors.ts`: support selected-frame-only crop processing.
- Create `src/utils/processors.test.ts`: tests for batch crop scope.
- Modify `src/components/FrameEditorModal.tsx`: fix history reset, crop scaling, keyboard shortcuts, dirty close handling, precision crop UI, and selected-frame batch crop labeling.
- Modify `src/App.tsx`: route batch crop through selected frames and report accurate counts.
- Modify `README.md`: replace Vite template text with actual workflow documentation.

## Phase 1: Correctness Fixes

### Task 1: Add Test Infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Add dependencies**

Run:

```bash
npm install -D vitest jsdom
```

Expected: `package.json` and `package-lock.json` update with Vitest and jsdom.

- [ ] **Step 2: Add scripts**

In `package.json`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 4: Create setup file**

Create `src/test/setup.ts`:

```ts
import { afterEach } from 'vitest';

afterEach(() => {
  document.body.innerHTML = '';
});
```

- [ ] **Step 5: Verify test runner**

Run:

```bash
npm run test
```

Expected: Vitest runs and reports no tests found, or passes once tests are added in the next task.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/setup.ts
git commit -m "test: add vitest setup"
```

### Task 2: Fix Crop Coordinate Mapping

**Files:**
- Modify: `src/utils/canvasEditor.ts`
- Create: `src/utils/canvasEditor.test.ts`
- Modify: `src/components/FrameEditorModal.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/utils/canvasEditor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clampPixelRect, displayCropToPixelRect } from './canvasEditor';

describe('displayCropToPixelRect', () => {
  it('converts scaled display crop values to source pixels', () => {
    expect(displayCropToPixelRect({ x: 20, y: 10, width: 100, height: 50 }, 0.5, 400, 200)).toEqual({
      x: 40,
      y: 20,
      width: 200,
      height: 100,
    });
  });

  it('clamps crop values to image bounds', () => {
    expect(clampPixelRect({ x: -5, y: 10, width: 500, height: 300 }, 100, 80)).toEqual({
      x: 0,
      y: 10,
      width: 100,
      height: 70,
    });
  });
});
```

Run:

```bash
npm run test -- src/utils/canvasEditor.test.ts
```

Expected: fail because helpers do not exist.

- [ ] **Step 2: Implement helpers**

Add to `src/utils/canvasEditor.ts`:

```ts
export function clampPixelRect(rect: PixelRect, maxWidth: number, maxHeight: number): PixelRect {
  const x = Math.max(0, Math.min(Math.round(rect.x), maxWidth - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y), maxHeight - 1));
  const right = Math.max(x + 1, Math.min(Math.round(rect.x + rect.width), maxWidth));
  const bottom = Math.max(y + 1, Math.min(Math.round(rect.y + rect.height), maxHeight));
  return { x, y, width: right - x, height: bottom - y };
}

export function displayCropToPixelRect(rect: PixelRect, scale: number, maxWidth: number, maxHeight: number): PixelRect {
  const safeScale = scale > 0 ? scale : 1;
  return clampPixelRect(
    {
      x: rect.x / safeScale,
      y: rect.y / safeScale,
      width: rect.width / safeScale,
      height: rect.height / safeScale,
    },
    maxWidth,
    maxHeight,
  );
}
```

- [ ] **Step 3: Use helper in editor**

In `src/components/FrameEditorModal.tsx`, replace the manual `rect` construction in `handleApplyCrop` with:

```ts
const rect = displayCropToPixelRect(crop, scale, canvas.width, canvas.height);
```

Also use the same conversion for the `onBatchCrop` button instead of passing `crop!` directly.

- [ ] **Step 4: Run tests and build**

```bash
npm run test -- src/utils/canvasEditor.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/canvasEditor.ts src/utils/canvasEditor.test.ts src/components/FrameEditorModal.tsx
git commit -m "fix: map crop coordinates to source pixels"
```

### Task 3: Reset History Per Frame and Add Dirty Close Guard

**Files:**
- Modify: `src/components/FrameEditorModal.tsx`

- [ ] **Step 1: Add dirty state**

Add:

```ts
const [isDirty, setIsDirty] = useState(false);
```

Update `saveState` to accept an optional dirty flag:

```ts
const saveState = (dataUrl: string, dirty = true) => {
  setHistory((prev) => {
    const newHistory = prev.slice(0, historyIndex + 1);
    newHistory.push(dataUrl);
    return newHistory;
  });
  setHistoryIndex((prev) => prev + 1);
  setIsDirty(dirty);
};
```

- [ ] **Step 2: Reset editor state when frame changes**

At the start of the `useEffect([frame])` load path, reset:

```ts
setHistory([]);
setHistoryIndex(-1);
setIsDirty(false);
setCrop(undefined);
setPan({ x: 0, y: 0 });
setActiveTool('pen');
```

When saving the initial image snapshot, call:

```ts
saveState(canvasRef.current!.toDataURL('image/png'), false);
```

- [ ] **Step 3: Add guarded close helper**

Add:

```ts
const requestClose = () => {
  if (!isDirty || window.confirm('Discard unsaved edits?')) {
    onClose();
  }
};
```

Use `requestClose` for Escape, overlay click, close icon, and footer Close.

- [ ] **Step 4: Clear dirty on save**

In `handleSave`, call `setIsDirty(false)` before `onSave`.

- [ ] **Step 5: Verify manually**

Run:

```bash
npm run build
npm run dev
```

Expected: opening a new frame starts with clean history; closing after edits asks for confirmation; saving closes without prompt.

- [ ] **Step 6: Commit**

```bash
git add src/components/FrameEditorModal.tsx
git commit -m "fix: reset editor history per frame"
```

### Task 4: Add Keyboard Shortcuts and Bounds Protection

**Files:**
- Modify: `src/components/FrameEditorModal.tsx`
- Modify: `src/utils/canvasEditor.ts`
- Modify: `src/utils/canvasEditor.test.ts`

- [ ] **Step 1: Add point bounds helper test**

Add to `src/utils/canvasEditor.test.ts`:

```ts
import { isPointInBounds } from './canvasEditor';

it('detects points outside the canvas', () => {
  expect(isPointInBounds({ x: 0, y: 0 }, 10, 10)).toBe(true);
  expect(isPointInBounds({ x: 10, y: 0 }, 10, 10)).toBe(false);
  expect(isPointInBounds({ x: -1, y: 0 }, 10, 10)).toBe(false);
});
```

- [ ] **Step 2: Implement point bounds helper**

Add to `src/utils/canvasEditor.ts`:

```ts
export function isPointInBounds(point: Point, width: number, height: number): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
}
```

- [ ] **Step 3: Guard fill and replace**

In `handlePointerDown`, before fill/replace pixel reads:

```ts
if (!isPointInBounds(pos, canvas.width, canvas.height)) return;
```

- [ ] **Step 4: Add keyboard shortcuts**

Update the keydown handler:

```ts
if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
  e.preventDefault();
  if (e.shiftKey) handleRedo();
  else handleUndo();
}
if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
  e.preventDefault();
  handleRedo();
}
```

- [ ] **Step 5: Run verification**

```bash
npm run test -- src/utils/canvasEditor.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

```bash
git add src/utils/canvasEditor.ts src/utils/canvasEditor.test.ts src/components/FrameEditorModal.tsx
git commit -m "fix: harden editor pointer and shortcut behavior"
```

## Phase 2: Frame Workflow Features

### Task 5: Make Batch Crop Apply to Selected Frames

**Files:**
- Modify: `src/utils/processors.ts`
- Create: `src/utils/processors.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/FrameEditorModal.tsx`

- [ ] **Step 1: Write processor test**

Create `src/utils/processors.test.ts` with a mocked crop flow that verifies unselected frames keep their original `dataUrl`.

- [ ] **Step 2: Update processor signature**

Change:

```ts
export const cropFrames = async (frames: ExtractedFrame[], rect: PixelRect, selectedOnly = true)
```

Skip unselected frames when `selectedOnly` is true.

- [ ] **Step 3: Update App messaging**

In `handleBatchCrop`, call:

```ts
const updatedFrames = await cropFrames(frames, rect, true);
const croppedCount = frames.filter((frame) => frame.selected).length;
pushToast('success', `Cropped ${croppedCount} selected frame${croppedCount === 1 ? '' : 's'}`);
```

- [ ] **Step 4: Update button label**

Change editor button text from `Apply to all frames` to `Apply to selected frames`.

- [ ] **Step 5: Run verification**

```bash
npm run test
npm run build
```

Expected: selected-only crop behavior passes tests.

- [ ] **Step 6: Commit**

```bash
git add src/utils/processors.ts src/utils/processors.test.ts src/App.tsx src/components/FrameEditorModal.tsx
git commit -m "feat: crop selected frames from editor"
```

### Task 6: Add Precision Crop Controls

**Files:**
- Modify: `src/components/FrameEditorModal.tsx`

- [ ] **Step 1: Add crop field inputs**

In the crop property section, show numeric inputs for `x`, `y`, `width`, and `height` when crop tool is active. Values should reflect source pixel coordinates via `displayCropToPixelRect`.

- [ ] **Step 2: Add input-to-display conversion**

When the user edits a crop input, convert source pixels back to display crop values:

```ts
setCrop({
  unit: 'px',
  x: nextPixelRect.x * scale,
  y: nextPixelRect.y * scale,
  width: nextPixelRect.width * scale,
  height: nextPixelRect.height * scale,
});
```

- [ ] **Step 3: Add quick crop actions**

Add compact buttons:

- `Full`: selects the full canvas.
- `Center`: recenters current crop.
- `1:1`: makes the crop square using the smaller dimension.

- [ ] **Step 4: Manual verification**

Run:

```bash
npm run dev
```

Expected: crop inputs match pixel output, changing values moves the crop box, and actions stay within image bounds.

- [ ] **Step 5: Commit**

```bash
git add src/components/FrameEditorModal.tsx
git commit -m "feat: add precision crop controls"
```

### Task 7: Add Onion Skin Frame Context

**Files:**
- Modify: `src/components/FrameEditorModal.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Extend modal props**

Add:

```ts
previousFrame?: ExtractedFrame | null;
nextFrame?: ExtractedFrame | null;
```

- [ ] **Step 2: Pass neighboring frames from App**

In `App.tsx`, compute the editing frame index and pass selected neighbors to `FrameEditorModal`.

- [ ] **Step 3: Add preview overlay controls**

Add a small toggle group in the editor footer or properties panel:

- `Prev`
- `Next`
- opacity slider from `0` to `80`

Render the chosen neighbor as an absolutely positioned image over the canvas with `mix-blend-mode: difference` or normal opacity.

- [ ] **Step 4: Manual verification**

Expected: user can compare current edits against adjacent frames without altering exported frame data.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/FrameEditorModal.tsx
git commit -m "feat: add onion skin context to frame editor"
```

## Phase 3: Interaction Polish and Documentation

### Task 8: Improve Zoom and Mobile Properties

**Files:**
- Modify: `src/components/FrameEditorModal.tsx`

- [ ] **Step 1: Add fit zoom**

Extract the initial fit-to-container logic into `fitToView()` and wire a `Fit` button beside `1:1`.

- [ ] **Step 2: Improve wheel zoom center**

Update wheel zoom so pan adjusts around the pointer position instead of zooming from the current transform origin.

- [ ] **Step 3: Mobile properties drawer**

Replace `hidden sm:flex` behavior with a compact bottom drawer on small screens. It should expose the same active-tool controls as the desktop aside.

- [ ] **Step 4: Manual verification**

Expected: desktop controls remain stable; mobile can edit color, brush size, opacity, tolerance, and crop actions.

- [ ] **Step 5: Commit**

```bash
git add src/components/FrameEditorModal.tsx
git commit -m "feat: improve editor viewport controls"
```

### Task 9: Add Eyedropper and Shape Fill

**Files:**
- Modify: `src/components/FrameEditorModal.tsx`
- Modify: `src/utils/canvasEditor.ts`
- Modify: `src/utils/canvasEditor.test.ts`

- [ ] **Step 1: Add color read helper**

Add and test:

```ts
export function colorToHex(color: Color): string {
  return `#${[color.r, color.g, color.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
```

- [ ] **Step 2: Add eyedropper tool**

Add `eyedropper` to the tool union and toolbar. On click, read the pixel under the pointer and set `color`.

- [ ] **Step 3: Add shape fill toggle**

Add `shapeFill` state. For rectangle/ellipse, either `stroke`, `fill`, or both based on UI controls.

- [ ] **Step 4: Verify**

Expected: eyedropper samples visible pixels; shapes can be outline-only or filled.

- [ ] **Step 5: Commit**

```bash
git add src/components/FrameEditorModal.tsx src/utils/canvasEditor.ts src/utils/canvasEditor.test.ts
git commit -m "feat: add eyedropper and filled shapes"
```

### Task 10: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace template README**

Document:

- What Frame Forge does.
- Supported imports.
- Extraction settings.
- Frame selection and dedupe tools.
- Editor tools and shortcuts.
- Batch crop selected frames.
- Export ZIP/GIF/sprite sheet.
- Local development commands.

- [ ] **Step 2: Verify commands**

```bash
npm run test
npm run build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document frame editor workflow"
```

## Final Verification

- [ ] Run full test suite:

```bash
npm run test
```

- [ ] Run production build:

```bash
npm run build
```

- [ ] Run local app:

```bash
npm run dev
```

- [ ] Manually verify:

- Open a GIF/video and extract frames.
- Edit one frame, undo/redo, close with unsaved changes, save.
- Crop at fit zoom and confirm exported dimensions match selected pixel crop.
- Batch crop selected frames only.
- Use precision crop inputs.
- Compare with previous/next frame using onion skin.
- Export ZIP, GIF, and sprite sheet.

