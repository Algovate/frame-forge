# Video Splitter to Frame Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Video Splitter send one or many split grid videos into Frame Editor as separate dynamic sticker clips.

**Architecture:** Splitter utilities will return structured `SplitVideoPart[]` and build ZIPs from those parts. `App` will own a handoff trigger that switches to Frame Editor. Frame Editor will keep a lightweight `StickerClip` queue so each split video owns its own frame sequence and export settings.

**Tech Stack:** React 19, TypeScript, Vite, Canvas/Video DOM APIs, FFmpeg WASM, JSZip, Vitest + jsdom, i18next.

---

### Task 1: Splitter Structured Parts

**Files:**
- Modify: `src/utils/ffmpegSplitter.ts`
- Test: `src/utils/ffmpegSplitter.test.ts`

- [ ] **Step 1: Add pure geometry helpers and types**

Create `SplitVideoPart`, `SplitGridGeometry`, `getSplitGridGeometry`, and `getSplitPartFilename` in `src/utils/ffmpegSplitter.ts`.

- [ ] **Step 2: Add tests for geometry and naming**

Test row-major output and invalid padding/gap rejection without loading FFmpeg.

- [ ] **Step 3: Refactor FFmpeg output to parts**

Add `splitVideoGridParts(...)` that crops videos and returns `SplitVideoPart[]` with `Blob`, `File`, dimensions, row, col, and filename.

- [ ] **Step 4: Preserve ZIP export**

Add `createSplitZip(parts)` and make existing `splitVideoGrid(...)` a compatibility wrapper.

- [ ] **Step 5: Run tests**

Run `npm test -- src/utils/ffmpegSplitter.test.ts`.

### Task 2: App Handoff Contract

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/tools/VideoSplitterTool.tsx`
- Modify: `src/components/tools/FrameEditorTool.tsx`

- [ ] **Step 1: Import the splitter part type into App**

Add `incomingStickerClips` state with `{ parts: SplitVideoPart[]; id: number }`.

- [ ] **Step 2: Pass handoff into splitter**

Add `onSendToFrameEditor(parts)` prop to `VideoSplitterTool`; callback sets trigger and switches `activeTool` to `frame`.

- [ ] **Step 3: Pass trigger into Frame Editor**

Add `incomingStickerClips` prop to `FrameEditorTool`.

### Task 3: Splitter Results UI

**Files:**
- Modify: `src/components/tools/VideoSplitterTool.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`

- [ ] **Step 1: Store split parts instead of immediate ZIP-only flow**

Use `splitVideoGridParts(...)`, store `splitParts`, then call `createSplitZip(...)` only for download.

- [ ] **Step 2: Add result grid**

Render video previews from part blobs, filenames, and row/col labels.

- [ ] **Step 3: Add actions**

Add `Download ZIP`, `Edit all in Frame Editor`, and per-cell `Edit` buttons.

- [ ] **Step 4: Revoke object URLs**

Create and clean preview URLs when `splitParts` changes or the component unmounts.

### Task 4: Frame Editor Clip Queue

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/tools/FrameEditorTool.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`

- [ ] **Step 1: Add `StickerClip` type**

Store id, name, source file, optional row/col, frames, settings, status, and optional error message.

- [ ] **Step 2: Convert incoming split parts to clips**

On trigger, create queued clips, select the first new clip, clear current direct-import source state, and keep clips separate.

- [ ] **Step 3: Persist active clip frames**

When frame mutations happen in queue mode, update the active clip's frames. Keep direct import behavior unchanged where possible.

- [ ] **Step 4: Add clip queue UI**

Render a compact rail above the gallery/import screen when clips exist.

- [ ] **Step 5: Extract active queued clip**

If the active clip has no frames, use the existing extraction controls and `extractFromVideo` against that clip's source file. Update only that clip.

### Task 5: Verification

**Files:**
- Existing test files as needed.

- [ ] **Step 1: Run unit tests**

Run `npm test`.

- [ ] **Step 2: Run build**

Run `npm run build`.

- [ ] **Step 3: Browser smoke test**

Start the dev server, open the app, verify the two tools load, and use available sample split files only if the full FFmpeg flow is too heavy for the automated smoke check.

- [ ] **Step 4: Final review**

Check `git diff`, ensure no unrelated files were changed, and report remaining manual verification gaps.
