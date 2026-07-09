import { useCallback, useState, useEffect } from 'react';
import { Header, type ToolType } from './components/Header';
import { ToastStack, type ToastItem, type ToastType } from './components/Toast';
import { AmbientBackground } from './components/AmbientBackground';
import { FrameEditorTool } from './components/tools/FrameEditorTool';
import { VideoSplitterTool } from './components/tools/VideoSplitterTool';

function App() {
  const [activeTool, setActiveTool] = useState<ToolType>('frame');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  
  // Frame Editor external states for Header integration
  const [hasFrames, setHasFrames] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [appendTrigger, setAppendTrigger] = useState<{ files: File[]; id: number } | undefined>();

  // Clear a pending append trigger when leaving the frame tool, so a remount
  // (frame → split → frame) doesn't re-fire the stale trigger on mount.
  useEffect(() => {
    if (activeTool !== 'frame') setAppendTrigger(undefined);
  }, [activeTool]);

  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, type, message }]); // cap at 3
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden px-4 sm:px-6 lg:px-8 py-4 text-foreground relative">
      <AmbientBackground />

      <div className="max-w-[1600px] w-full mx-auto flex-none z-10 relative">
        <Header 
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onReset={activeTool === 'frame' && hasFrames ? () => setResetTrigger(n => n + 1) : undefined} 
          onAppendFiles={activeTool === 'frame' && hasFrames ? (files) => setAppendTrigger({ files, id: Date.now() }) : undefined}
        />
      </div>

      <main className="flex-1 min-h-0 max-w-[1600px] w-full mx-auto relative flex flex-col">
        {activeTool === 'frame' && (
          <FrameEditorTool
            onPushToast={pushToast}
            onHasFramesChange={setHasFrames}
            resetTrigger={resetTrigger}
            appendTrigger={appendTrigger}
          />
        )}
        
        {activeTool === 'split' && (
          <VideoSplitterTool 
            onPushToast={pushToast} 
          />
        )}
      </main>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
