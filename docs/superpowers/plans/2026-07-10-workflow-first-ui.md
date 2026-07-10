# Workflow-First UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize Frame Forge around sticker creation, contextual editing, and responsive asset access.

**Architecture:** Keep the Zustand tool state and media processors intact. Replace the header's equal tool tabs with workflow destinations, make the existing asset library an optional responsive panel, and treat Canvas Editor as a temporary contextual workspace with a back target.

**Tech Stack:** React, TypeScript, Zustand, Tailwind CSS, Lucide, Vitest, Vite.

---

### Task 1: Define workflow navigation state and header controls

**Files:**
- Modify: `src/store.ts`
- Modify: `src/components/Header.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`

- [ ] Extend the existing `frame` / `split` / `canvas` tool state only with an `isAssetPanelOpen` value; remove the competing local `isSidebarOpen` state from `App`.
- [ ] Replace Canvas top-level navigation with Sticker Studio, Project Assets, and Tools controls. Project Assets toggles the panel and keeps Sticker Studio active. Retain standalone canvas access by opening image assets in Canvas Editor and loading video assets into Sticker Studio.
- [ ] Keep labels visible for mobile top-level navigation and give every header control a minimum 44px touch target.
- [ ] Add translated labels and accessible names for header controls, Canvas Back, and FrameGallery icon actions.
- [ ] Run `npm run build`.

### Task 2: Make assets responsive and contextual

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/sidebar/AssetLibraryPanel.tsx`

- [ ] Render the asset panel only when `isAssetPanelOpen` is true; non-empty state updates the header count but never auto-opens it.
- [ ] Remove the legacy edge toggle. Below `lg`, switch `main` from horizontal to vertical flow and render assets above the workspace as a collapsible full-width section.
- [ ] Ensure the active workspace is never horizontally compressed by the panel.
- [ ] Run `npm run build`.

### Task 3: Add contextual canvas return and action grouping

**Files:**
- Modify: `src/components/tools/CanvasEditorTool.tsx`
- Modify: `src/components/FrameGallery.tsx`

- [ ] Add a clear Back to Sticker Studio action in Canvas Editor; both Back and Save & Close set `activeTool` to `frame`. Back does not save current edits.
- [ ] Group cleanup actions separately from selection-dependent mutations; hide duplicate, reverse, trim before/after, and both delete actions until `selectedCount > 0`.
- [ ] Keep all existing callbacks and keyboard selection behavior.
- [ ] Run `npm test -- --run`.

### Task 4: Verify the rendered interface

**Files:**
- No source changes expected.

- [ ] Run `npm run build` and `npm test -- --run`.
- [ ] Check Sticker Studio, Project Assets, and Tools at desktop width.
- [ ] Check the 375px asset toggle, studio upload state, and tools upload state for horizontal overflow.
- [ ] Manually verify Edit frame → Canvas → Back and Edit frame → Save & Close → Sticker Studio, as the current test setup contains only utility tests.
