import { useCallback, useState } from 'react';
import { Header } from './components/Header';
import { ToastStack, type ToastItem, type ToastType } from './components/Toast';
import { AmbientBackground } from './components/AmbientBackground';
import { FrameEditorTool } from './components/tools/FrameEditorTool';
import { VideoSplitterTool } from './components/tools/VideoSplitterTool';
import { AssetLibraryPanel } from './components/sidebar/AssetLibraryPanel';
import type { SplitVideoPart } from './utils/ffmpegSplitter';
import { assetFromSplitPart } from './utils/assets';
import type { AssetLibraryItem } from './types';
import { useAppStore } from './store';

function App() {
  const { activeTool, setActiveTool, loadIncomingClipHandler, isProcessing } = useAppStore();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, type, message }]); // cap at 3
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const [assetLibrary, setAssetLibrary] = useState<AssetLibraryItem[]>([]);

  const addSplitPartsToAssetLibrary = useCallback((parts: SplitVideoPart[]) => {
    if (parts.length === 0) return;
    setAssetLibrary((prev) => [...prev, ...parts.map(assetFromSplitPart)]);
  }, []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="h-screen flex flex-col overflow-hidden px-4 sm:px-6 lg:px-8 py-4 text-foreground relative">
      <AmbientBackground />

      <div className="max-w-[1600px] w-full mx-auto flex-none z-10 relative">
        <Header />
      </div>

      <main className="flex-1 min-h-0 max-w-[1600px] w-full mx-auto relative flex flex-row mt-4 gap-4">
        {/* Global Sidebar */}
        <div 
          className={`relative transition-all duration-300 ease-in-out shrink-0 flex flex-col ${
            isSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0 overflow-hidden'
          }`}
        >
          <div className="w-64 h-full flex flex-col overflow-y-auto custom-scrollbar pb-6">
            <AssetLibraryPanel
              assets={assetLibrary}
              onUseAsset={(asset) => {
                if (isProcessing) return;
                loadIncomingClipHandler?.(asset);
                setActiveTool('frame');
              }}
              onRemoveAsset={(id) => setAssetLibrary((prev) => prev.filter(a => a.id !== id))}
              onClearAssets={() => setAssetLibrary([])}
            />
          </div>
        </div>

        {/* Sidebar Toggle Button */}
        <div className="relative flex items-center justify-center -ml-2 z-20">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-4 h-12 glass-panel rounded-control flex items-center justify-center border border-hairline hover:bg-surface-hover hover:text-primary transition-colors text-muted"
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <div className={`w-0 h-0 border-y-[4px] border-y-transparent border-r-[4px] border-r-current transition-transform duration-300 ${isSidebarOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 relative flex flex-col min-h-0">
          <div className={activeTool === 'frame' ? 'contents' : 'hidden'}>
            <FrameEditorTool
              onPushToast={pushToast}
              onAssetStatusChange={(id, status, error) => {
                setAssetLibrary(prev => {
                  // Skip the array allocation (and the App re-render it triggers)
                  // when nothing actually changed — frame mutations fire this often.
                  const asset = prev.find(a => a.id === id);
                  if (!asset || (asset.status === status && asset.errorMessage === error)) return prev;
                  return prev.map(a => a.id === id ? { ...a, status, errorMessage: error } : a);
                });
              }}
            />
          </div>
          
          <div className={activeTool === 'split' ? 'contents' : 'hidden'}>
            <VideoSplitterTool 
              onPushToast={pushToast} 
              onAddSplitPartsToAssetLibrary={addSplitPartsToAssetLibrary}
            />
          </div>
        </div>
      </main>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
