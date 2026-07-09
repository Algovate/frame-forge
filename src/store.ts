import { create } from 'zustand';
import type { ExtractedFrame, AssetLibraryItem } from './types';
import { revokeFrameUrls } from './utils/media';

export type ToolType = 'frame' | 'split';

interface AppState {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;

  // Frame Editor State
  frames: ExtractedFrame[];
  sourceFiles: File[];
  activeAssetId: string | null;
  // True while the frame editor is running an async job (extract/matting/export).
  // Lifted into the store so Header/App can disable actions during processing.
  isProcessing: boolean;

  setFrames: (frames: ExtractedFrame[] | ((prev: ExtractedFrame[]) => ExtractedFrame[])) => void;
  setSourceFiles: (files: File[]) => void;
  setActiveAssetId: (id: string | null) => void;
  setIsProcessing: (value: boolean) => void;
  
  // App-level resets
  resetWorkspace: () => void;
  
  // Imperative handlers registered by tools
  appendFilesHandler: ((files: File[]) => void) | null;
  setAppendFilesHandler: (handler: ((files: File[]) => void) | null) => void;

  loadIncomingClipHandler: ((clip: AssetLibraryItem) => void) | null;
  setLoadIncomingClipHandler: (handler: ((clip: AssetLibraryItem) => void) | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTool: 'frame',
  setActiveTool: (tool) => set({ activeTool: tool }),

  frames: [],
  sourceFiles: [],
  activeAssetId: null,
  isProcessing: false,

  setFrames: (action) => set((state) => ({
    frames: typeof action === 'function' ? action(state.frames) : action
  })),

  setSourceFiles: (files) => set({ sourceFiles: files }),

  setActiveAssetId: (id) => set({ activeAssetId: id }),

  setIsProcessing: (value) => set({ isProcessing: value }),

  resetWorkspace: () => set((state) => {
    revokeFrameUrls(state.frames);
    return {
      frames: [],
      sourceFiles: [],
      activeAssetId: null,
    };
  }),

  appendFilesHandler: null,
  setAppendFilesHandler: (handler) => set({ appendFilesHandler: handler }),

  loadIncomingClipHandler: null,
  setLoadIncomingClipHandler: (handler) => set({ loadIncomingClipHandler: handler }),
}));
