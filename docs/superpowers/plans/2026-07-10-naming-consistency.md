# Naming Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ambiguous and misspelled internal names while preserving all workspace behavior.

**Architecture:** Rename the FFmpeg module and migrate all import paths. Centralize asset typing under `ProjectAsset`, distinguish image/video/split-video resources at construction, and rename top-level workspace routing and store command callbacks to reflect their actual roles.

**Tech Stack:** TypeScript, React 19, Zustand, Vite, Vitest.

---

### Task 1: Rename the FFmpeg splitter module

**Files:**
- Rename: `src/utils/ffmpegSpliter.ts` to `src/utils/ffmpegSplitter.ts`
- Rename: `src/utils/ffmpegSpliter.test.ts` to `src/utils/ffmpegSplitter.test.ts`
- Modify: all source, test, and pre-existing `docs/` references to the old module name

- [ ] **Step 1: Locate every old path reference**

Run: `rg -n 'ffmpegSpliter' src docs --glob '!2026-07-10-naming-consistency*.md'`
Expected: imports, test imports, and prior planning references are listed.

- [ ] **Step 2: Rename the module and test files**

Run: `mv src/utils/ffmpegSpliter.ts src/utils/ffmpegSplitter.ts && mv src/utils/ffmpegSpliter.test.ts src/utils/ffmpegSplitter.test.ts`
Expected: the source and test use the corrected spelling.

- [ ] **Step 3: Update references**

Replace every `ffmpegSpliter` string with `ffmpegSplitter` in repository source, tests, and documentation.

- [ ] **Step 4: Verify no old references remain**

Run: `rg -n 'ffmpegSpliter' src docs --glob '!2026-07-10-naming-consistency*.md'`
Expected: no matches. The new design and plan may retain the old spelling only when documenting this migration.

### Task 2: Model project assets and workspace views accurately

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/utils/assets.ts`
- Modify: `src/store.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/sidebar/AssetLibraryPanel.tsx`
- Modify: `src/components/tools/CanvasEditorTool.tsx`
- Modify: `src/components/tools/FrameEditorTool.tsx`
- Modify: `src/components/tools/VideoSplitterTool.tsx`

- [ ] **Step 1: Rename asset and view types**

Change `AssetLibraryItem` to `ProjectAsset` and `ToolType` to `WorkspaceView`. Define `ProjectAsset.kind` as `image | video | split-video` and use `studio | splitter | canvas-editor` for views.

- [ ] **Step 2: Assign accurate asset kinds at each factory**

Update raw-file creation to infer `image` or `video` from the file MIME type; retain `split-video` for generated split parts.

- [ ] **Step 3: Migrate all consumers**

Replace type imports and workspace-view comparisons, maintaining the existing display and navigation behavior.

- [ ] **Step 4: Rename store commands**

Rename the three registered callback/setter pairs, updating registrations and invocations together:

- `appendFilesHandler` / `setAppendFilesHandler` → `appendFramesFromFiles` / `setAppendFramesFromFiles`
- `loadIncomingClipHandler` / `setLoadIncomingClipHandler` → `loadAssetIntoFrameEditor` / `setLoadAssetIntoFrameEditor`
- `loadVideoSplitterClipHandler` / `setLoadVideoSplitterClipHandler` → `loadFileIntoVideoSplitter` / `setLoadFileIntoVideoSplitter`

- [ ] **Step 5: Check for stale identifiers**

Run: `rg -n 'AssetLibraryItem|ToolType|appendFilesHandler|loadIncomingClipHandler|loadVideoSplitterClipHandler' src`
Expected: no matches.

### Task 3: Verify the refactor

**Files:**
- Test: `src/utils/ffmpegSplitter.test.ts`
- Test: all existing Vitest suites

- [ ] **Step 1: Run focused splitter tests**

Run: `npm test -- src/utils/ffmpegSplitter.test.ts`
Expected: passing splitter utility tests.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Build production assets**

Run: `npm run build`
Expected: TypeScript type checking and Vite build pass.

- [ ] **Step 4: Review the final diff**

Run: `git diff --check && git diff -- src`
Expected: no whitespace errors and only naming-related source changes.

- [ ] **Step 5: Commit**

```bash
git add src docs/superpowers
git commit -m "refactor: clarify project naming"
```
