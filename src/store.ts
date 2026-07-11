import { create } from 'zustand';
import type { ExtractedFrame, ProjectAsset } from './types';
import { revokeFrameUrls } from './utils/media';

export type WorkspaceView = 'studio' | 'splitter' | 'canvas-editor';

interface AppState {
  activeTool: WorkspaceView;
  setActiveTool: (tool: WorkspaceView) => void;
  isAssetPanelOpen: boolean;
  setIsAssetPanelOpen: (value: boolean | ((previous: boolean) => boolean)) => void;

  // Frame Editor State
  frames: ExtractedFrame[];
  sourceFiles: File[];
  activeAssetId: string | null;
  editingFrameId: string | null;
  editingAssetId: string | null;
  // True while the frame editor is running an async job (extract/matting/export).
  // Lifted into the store so Header/App can disable actions during processing.
  isProcessing: boolean;
  // True when the canvas editor has unsaved edits. App reads this to confirm
  // before navigation that would discard them; the editor writes it only on
  // transitions so drawing strokes don't churn store subscribers.
  canvasDirty: boolean;

  setFrames: (frames: ExtractedFrame[] | ((prev: ExtractedFrame[]) => ExtractedFrame[])) => void;
  setSourceFiles: (files: File[]) => void;
  setActiveAssetId: (id: string | null) => void;
  setEditingFrameId: (id: string | null) => void;
  setEditingAssetId: (id: string | null) => void;
  setIsProcessing: (value: boolean) => void;
  setCanvasDirty: (value: boolean) => void;

  // App-level resets
  resetWorkspace: () => void;
  
  // Asset Library State
  assetLibrary: ProjectAsset[];
  setAssetLibrary: (assets: ProjectAsset[] | ((prev: ProjectAsset[]) => ProjectAsset[])) => void;

  // Imperative handlers registered by tools
  appendFramesFromFiles: ((files: File[]) => void) | null;
  setAppendFramesFromFiles: (handler: ((files: File[]) => void) | null) => void;

  loadAssetIntoFrameEditor: ((asset: ProjectAsset) => void) | null;
  setLoadAssetIntoFrameEditor: (handler: ((asset: ProjectAsset) => void) | null) => void;

  loadFileIntoVideoSplitter: ((file: File) => void) | null;
  setLoadFileIntoVideoSplitter: (handler: ((file: File) => void) | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTool: 'studio',
  setActiveTool: (tool) => set({ activeTool: tool }),
  isAssetPanelOpen: true,
  setIsAssetPanelOpen: (value) => set((state) => ({
    isAssetPanelOpen: typeof value === 'function' ? value(state.isAssetPanelOpen) : value,
  })),

  frames: [],
  sourceFiles: [],
  activeAssetId: null,
  editingFrameId: null,
  editingAssetId: null,
  isProcessing: false,
  canvasDirty: false,
  assetLibrary: [],

  setFrames: (action) => set((state) => ({
    frames: typeof action === 'function' ? action(state.frames) : action
  })),

  setSourceFiles: (files) => set({ sourceFiles: files }),

  setActiveAssetId: (id) => set({ activeAssetId: id }),
  setEditingFrameId: (id) => set({ editingFrameId: id }),
  setEditingAssetId: (id) => set({ editingAssetId: id }),

  setIsProcessing: (value) => set({ isProcessing: value }),
  setCanvasDirty: (value) => set({ canvasDirty: value }),

  setAssetLibrary: (action) => set((state) => ({
    assetLibrary: typeof action === 'function' ? action(state.assetLibrary) : action
  })),

  resetWorkspace: () => set((state) => {
    revokeFrameUrls(state.frames);
    return {
      frames: [],
      sourceFiles: [],
      activeAssetId: null,
      editingFrameId: null,
      editingAssetId: null,
    };
  }),

  appendFramesFromFiles: null,
  setAppendFramesFromFiles: (handler) => set({ appendFramesFromFiles: handler }),

  loadAssetIntoFrameEditor: null,
  setLoadAssetIntoFrameEditor: (handler) => set({ loadAssetIntoFrameEditor: handler }),

  loadFileIntoVideoSplitter: null,
  setLoadFileIntoVideoSplitter: (handler) => set({ loadFileIntoVideoSplitter: handler }),
}));
