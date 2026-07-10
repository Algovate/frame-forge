import { useCallback, useState } from 'react';
import { Header } from './components/Header';
import { ToastStack, type ToastItem, type ToastType } from './components/Toast';
import { AmbientBackground } from './components/AmbientBackground';
import { FrameEditorTool } from './components/tools/FrameEditorTool';
import { VideoSplitterTool } from './components/tools/VideoSplitterTool';
import { CanvasEditorTool } from './components/tools/CanvasEditorTool';
import { AssetLibraryPanel } from './components/sidebar/AssetLibraryPanel';
import { useAppStore } from './store';
import { assetFromFile } from './utils/assets';
import { useTranslation } from 'react-i18next';

function App() {
  const {
    activeTool, setActiveTool, loadAssetIntoFrameEditor, loadFileIntoVideoSplitter, isProcessing,
    assetLibrary, setAssetLibrary, setEditingAssetId, setEditingFrameId,
    isAssetPanelOpen, setIsAssetPanelOpen, canvasDirty,
  } = useAppStore();
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, type, message }]); // cap at 3
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Open a library asset on the canvas editor: drop any in-progress frame
  // edit, target the asset, switch tools, and hide the asset panel.
  const openAssetInCanvas = (assetId: string) => {
    if (canvasDirty && !window.confirm(t('editor.discard'))) return;
    setEditingFrameId(null);
    setEditingAssetId(assetId);
    setActiveTool('canvas-editor');
    setIsAssetPanelOpen(false);
  };

  return (
    <div className="min-h-dvh flex flex-col overflow-x-hidden px-4 py-4 text-foreground relative sm:px-6 lg:h-screen lg:overflow-hidden lg:px-8">
      <AmbientBackground />

      <div className="max-w-[1600px] w-full mx-auto flex-none z-10 relative">
        <Header />
      </div>

      <main className="flex-1 min-h-0 max-w-[1600px] w-full mx-auto relative flex flex-col mt-4 gap-4 lg:flex-row">
        {isAssetPanelOpen && (
          <aside className="w-full shrink-0 custom-scrollbar lg:w-64 lg:h-full lg:overflow-y-auto lg:pb-6">
            <AssetLibraryPanel
              assets={assetLibrary}
              onUseAsset={(asset) => {
                if (asset.kind === 'image' && asset.file.type !== 'image/gif') {
                  openAssetInCanvas(asset.id);
                  return;
                }
                if (isProcessing) return;
                if (activeTool === 'splitter') {
                  loadFileIntoVideoSplitter?.(asset.file);
                  return;
                }
                loadAssetIntoFrameEditor?.(asset);
                setActiveTool('studio');
                setIsAssetPanelOpen(false);
              }}
              onRemoveAsset={(id) => setAssetLibrary((prev) => prev.filter(a => a.id !== id))}
              onClearAssets={() => setAssetLibrary([])}
              onAddImage={(file) => {
                const asset = assetFromFile(file);
                setAssetLibrary((previous) => [...previous, asset]);
                openAssetInCanvas(asset.id);
              }}
            />
          </aside>
        )}

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 relative flex flex-col min-h-0">
          <div className={activeTool === 'studio' ? 'contents' : 'hidden'}>
            <FrameEditorTool
              onPushToast={pushToast}
            />
          </div>
          
          <div className={activeTool === 'splitter' ? 'contents' : 'hidden'}>
            <VideoSplitterTool 
              onPushToast={pushToast} 
            />
          </div>

          <div className={activeTool === 'canvas-editor' ? 'contents' : 'hidden'}>
            <CanvasEditorTool onPushToast={pushToast} onBack={() => setActiveTool('studio')} />
          </div>
        </div>
      </main>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
