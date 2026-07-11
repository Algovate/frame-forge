import { useCallback, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { Header } from './components/Header';
import { ToastStack, type ToastItem, type ToastType } from './components/Toast';
import { AmbientBackground } from './components/AmbientBackground';
import { FrameEditorTool } from './components/tools/FrameEditorTool';
import { VideoSplitterTool } from './components/tools/VideoSplitterTool';
import { CanvasEditorTool } from './components/tools/CanvasEditorTool';
import { AssetLibraryPanel } from './components/sidebar/AssetLibraryPanel';
import { useAppStore } from './store';
import { assetFromFile, getAssetUseTarget } from './utils/assets';
import { useTranslation } from 'react-i18next';

function App() {
  const {
    activeTool, setActiveTool, loadAssetIntoFrameEditor, loadFileIntoVideoSplitter, appendFramesFromFiles, isProcessing,
    assetLibrary, setAssetLibrary, setEditingAssetId, setEditingFrameId,
    isAssetPanelOpen, setIsAssetPanelOpen, canvasDirty,
  } = useAppStore();
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((type: ToastType, message: string, action?: ToastItem['action']) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, type, message, action }]); // cap at 3
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
    <div className="min-h-dvh flex flex-col overflow-x-hidden bg-background px-3 py-3 text-foreground relative sm:px-5 lg:h-screen lg:overflow-hidden lg:px-6">
      <AmbientBackground />

      <div className="max-w-[1600px] w-full mx-auto flex-none z-10 relative border-b border-hairline pb-3">
        <Header />
      </div>

      <main className="flex-1 min-h-0 max-w-[1600px] w-full mx-auto relative flex flex-col mt-3 gap-3 lg:flex-row">
        {isAssetPanelOpen ? (
          <aside className="w-full shrink-0 custom-scrollbar lg:w-72 lg:h-full lg:overflow-y-auto lg:pb-3">
            <AssetLibraryPanel
              onClose={() => setIsAssetPanelOpen(false)}
              assets={assetLibrary}
              onUseAsset={(asset) => {
                const target = getAssetUseTarget(asset, activeTool);
                if (target === 'canvas-editor') {
                  openAssetInCanvas(asset.id);
                  return;
                }
                if (isProcessing) return;
                if (target === 'splitter') {
                  loadFileIntoVideoSplitter?.(asset.file);
                  return;
                }
                loadAssetIntoFrameEditor?.(asset);
                setActiveTool('studio');
                setIsAssetPanelOpen(false);
              }}
              getUseTarget={(asset) => getAssetUseTarget(asset, activeTool)}
              onUseSelected={(assets) => {
                if (isProcessing || !appendFramesFromFiles) return;
                appendFramesFromFiles(assets.map(({ file }) => file));
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
        ) : (
          <aside className="w-full shrink-0 flex items-center lg:flex-col lg:w-12 lg:h-full lg:border-r lg:border-hairline lg:pt-2">
            <button onClick={() => setIsAssetPanelOpen(true)} className="flex items-center gap-2 p-2 rounded-control text-muted hover:text-foreground hover:bg-surface-hover lg:justify-center w-full" title={t('nav.assets', 'Project Assets')}>
              <PanelLeft className="w-5 h-5" />
              <span className="lg:hidden text-sm font-medium">{t('nav.assets', 'Project Assets')}</span>
            </button>
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
