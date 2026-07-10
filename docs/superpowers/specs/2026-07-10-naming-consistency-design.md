# Naming Consistency Design

## Goal

Make shared types, workspace state, command callbacks, and the FFmpeg splitter module use accurate, consistent names without changing application behavior.

## Scope

- Rename the misspelled `ffmpegSpliter` module to `ffmpegSplitter` and update every source, test, and project-document reference.
- Replace `AssetLibraryItem` with `ProjectAsset` and model the actual media category with `kind: 'image' | 'video' | 'split-video'`.
- Replace the routing-oriented `ToolType` with `WorkspaceView`, with parallel values: `studio`, `splitter`, and `canvas-editor`.
- Replace store-level callback names ending in `Handler` with intention-revealing command names:
  - `appendFramesFromFiles`
  - `loadAssetIntoFrameEditor`
  - `loadFileIntoVideoSplitter`

## Design

`ProjectAsset` remains the common object stored in the asset library. Its `kind` expresses media provenance and is assigned by the asset factory: images are `image`, imported videos are `video`, and generated grid/video split outputs are `split-video`.

`WorkspaceView` owns only top-level workspace routing. Components continue to select their existing view behavior, but use `studio`, `splitter`, and `canvas-editor` rather than mixed domain terms.

The store retains its current callback registration mechanism. Only its public names change so consumers describe the requested operation rather than their implementation as an event handler.

## Compatibility and Verification

This is a source-compatible-in-repository refactor with no persisted state or external API. All imports, tests, and developer documentation will move in the same change. Verification consists of the TypeScript/Vite build and the Vitest suite.
