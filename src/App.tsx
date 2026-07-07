import { useCallback, useState } from 'react';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { FrameGallery } from './components/FrameGallery';
import { ToastStack, type ToastItem, type ToastType } from './components/Toast';
import { AmbientBackground } from './components/AmbientBackground';
import type { ExtractedFrame, ProcessingPhase } from './types';
import { extractFromGIF, extractFromVideo } from './utils/extractors';
import { findDuplicateFrames, findLoopFrames, findJumpFrames, batchRemoveBackground } from './utils/processors';
import { exportZIP, exportGIF, exportSpriteSheet } from './utils/exporters';
import { revokeFrameUrls } from './utils/media';
import { Loader2 } from 'lucide-react';

const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv', 'avi', 'flv', 'wmv', '3gp', 'ts'];

/** Classify a dropped file by MIME (preferred), with an extension fallback so
 *  videos whose OS didn't tag a MIME type aren't wrongly rejected. */
const classifyMedia = (file: File): 'gif' | 'video' | null => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.type === 'image/gif' || ext === 'gif') return 'gif';
  if (file.type.startsWith('video/') || VIDEO_EXT.includes(ext)) return 'video';
  return null;
};

function App() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [processMsg, setProcessMsg] = useState('');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Settings
  const [fps, setFps] = useState<number>(10);
  const [gifDelay, setGifDelay] = useState<number>(100);
  const [exportWidth, setExportWidth] = useState<number>(0);
  const [exportHeight, setExportHeight] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(-1);

  // Sprite Sheet Settings
  const [spriteCols, setSpriteCols] = useState<number>(0);
  const [spritePadding, setSpritePadding] = useState<number>(0);

  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, type, message }]); // cap at 3
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /** Run an async operation under the processing overlay. Guarantees errors
   *  become a toast (never an unrecovered overlay) and isProcessing always
   *  clears — via try/catch/finally, not just a trailing setter. */
  const runProcessing = useCallback(
    (p: ProcessingPhase, message: string, work: () => Promise<void>, errorText: string) => {
      setIsProcessing(true);
      setPhase(p);
      setProcessMsg(message);
      (async () => {
        try {
          await work();
        } catch (e) {
          console.error(e);
          pushToast('error', errorText);
        } finally {
          setIsProcessing(false);
        }
      })();
    },
    [pushToast],
  );

  /** Shared entry point for both click-input and drag-and-drop, so validation
   *  + feedback can never diverge between the two paths. */
  const acceptFile = useCallback(
    (file?: File | null) => {
      if (file && classifyMedia(file)) {
        revokeFrameUrls(frames); // free matting output from the previous file
        setFrames([]);
        setSourceFile(file);
        pushToast('success', `Loaded ${file.name}`);
      } else if (file) {
        pushToast('error', 'Unsupported file. Use a video or GIF.');
      }
    },
    [pushToast, frames],
  );

  const processSource = () => {
    if (!sourceFile) return;
    const kind = classifyMedia(sourceFile);
    if (!kind) {
      pushToast('error', 'Unsupported file. Use a video or GIF.');
      return;
    }
    runProcessing(
      'extracting',
      'Extracting frames...',
      async () => {
        revokeFrameUrls(frames); // free matting output before re-extracting
        setFrames([]);
        let extracted: ExtractedFrame[];
        if (kind === 'gif') {
          extracted = await extractFromGIF(sourceFile, (f) => setFrames([...f]));
        } else {
          extracted = (
            await extractFromVideo(sourceFile, fps, startTime, endTime, (f) => setFrames([...f]))
          ).frames;
        }
        const n = extracted.length;
        pushToast('success', `Extracted ${n} frame${n === 1 ? '' : 's'}`);
      },
      'Could not extract frames from that file',
    );
  };

  const handleFindDuplicates = (threshold: number) =>
    runProcessing('deduping', 'Finding duplicate frames...', async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findDuplicateFrames(frames, threshold);
      setFrames(next);
      const removed = before - next.filter((f) => f.selected).length;
      pushToast('info', removed > 0 ? `Unselected ${removed} duplicate frame${removed === 1 ? '' : 's'}` : 'No duplicate frames found');
    }, 'Could not analyze frames');

  const handleFindLoops = (threshold: number) =>
    runProcessing('deduping', 'Finding loop frames...', async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findLoopFrames(frames, threshold);
      setFrames(next);
      const removed = before - next.filter((f) => f.selected).length;
      pushToast('info', removed > 0 ? `Unselected ${removed} trailing frame${removed === 1 ? '' : 's'} to form loop` : 'No loop found');
    }, 'Could not analyze frames');

  const handleFindJumps = (threshold: number) =>
    runProcessing('deduping', 'Finding jump frames...', async () => {
      const before = frames.filter((f) => f.selected).length;
      const next = await findJumpFrames(frames, threshold);
      setFrames(next);
      const removed = before - next.filter((f) => f.selected).length;
      pushToast('info', removed > 0 ? `Unselected ${removed} jump frame${removed === 1 ? '' : 's'}` : 'No jump frames found');
    }, 'Could not analyze frames');

  const handleInvertSelection = () => {
    setFrames(frames.map((f) => ({ ...f, selected: !f.selected })));
  };

  const handleReverseFrames = () => {
    setFrames([...frames].reverse());
  };

  const handleRemoveSubsequent = (fromId: string) => {
    const idx = frames.findIndex((f) => f.id === fromId);
    if (idx === -1) return;
    setFrames(frames.map((f, i) => (i > idx ? { ...f, selected: false } : f)));
  };

  const handleRemovePreceding = (toId: string) => {
    const idx = frames.findIndex((f) => f.id === toId);
    if (idx === -1) return;
    setFrames(frames.map((f, i) => (i < idx ? { ...f, selected: false } : f)));
  };

  const handleRemoveBackgrounds = () =>
    runProcessing('matting', 'Loading AI Model & Matting...', async () => {
      const next = await batchRemoveBackground(frames, (msg, updatedFrames) => {
        setProcessMsg(msg);
        setFrames([...updatedFrames]);
      });
      setFrames(next);
      pushToast('success', 'Background removal complete');
    }, 'Background removal failed');

  const handleExportZIP = () => {
    if (!frames.some((f) => f.selected)) return pushToast('info', 'Select at least one frame first');
    runProcessing('exporting', 'Generating ZIP...', async () => {
      await exportZIP(frames, exportWidth, exportHeight);
      pushToast('success', 'ZIP archive ready');
    }, 'ZIP export failed');
  };
  const handleExportGIF = () => {
    if (!frames.some((f) => f.selected)) return pushToast('info', 'Select at least one frame first');
    runProcessing('exporting', 'Encoding GIF...', async () => {
      await exportGIF(frames, gifDelay, exportWidth, exportHeight);
      pushToast('success', 'Animated GIF ready');
    }, 'GIF export failed');
  };
  const handleExportSpriteSheet = () => {
    if (!frames.some((f) => f.selected)) return pushToast('info', 'Select at least one frame first');
    runProcessing(
      'exporting',
      'Packing sprite sheet...',
      async () => {
        await exportSpriteSheet(frames, spriteCols, spritePadding, exportWidth, exportHeight);
        pushToast('success', 'Sprite sheet ready');
      },
      'Sprite sheet export failed',
    );
  };

  const toggleFrameSelection = (id: string) => {
    setFrames(frames.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)));
  };

  const deleteSelected = () => {
    revokeFrameUrls(frames.filter((f) => f.selected));
    setFrames(frames.filter((f) => !f.selected));
  };
  const deleteUnselected = () => {
    revokeFrameUrls(frames.filter((f) => !f.selected));
    setFrames(frames.filter((f) => f.selected));
  };
  const selectAll = () => setFrames(frames.map((f) => ({ ...f, selected: true })));

  return (
    <div className="h-screen flex flex-col overflow-hidden px-4 sm:px-6 lg:px-8 py-4 text-foreground relative">
      <AmbientBackground />

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-[1600px] w-full mx-auto relative">
        <LeftSidebar
          sourceFile={sourceFile}
          isProcessing={isProcessing}
          phase={phase}
          fps={fps}
          setFps={setFps}
          startTime={startTime}
          setStartTime={setStartTime}
          endTime={endTime}
          setEndTime={setEndTime}
          onFileSelected={acceptFile}
          onProcessSource={processSource}
        />

        <section className="lg:col-span-6 flex flex-col relative min-h-0">
          {isProcessing && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-card bg-black/60 backdrop-blur-sm">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-lg font-medium">{processMsg}</p>
            </div>
          )}
          <FrameGallery
            frames={frames}
            onToggleSelection={toggleFrameSelection}
            onSelectAll={selectAll}
            onDeleteSelected={deleteSelected}
            onDeleteUnselected={deleteUnselected}
            onFindDuplicates={handleFindDuplicates}
            onFindLoops={handleFindLoops}
            onFindJumps={handleFindJumps}
            onInvertSelection={handleInvertSelection}
            onReverseFrames={handleReverseFrames}
            onRemoveSubsequent={handleRemoveSubsequent}
            onRemovePreceding={handleRemovePreceding}
          />
        </section>

        <RightSidebar
          frames={frames}
          isProcessing={isProcessing}
          gifDelay={gifDelay}
          setGifDelay={setGifDelay}
          exportWidth={exportWidth}
          setExportWidth={setExportWidth}
          exportHeight={exportHeight}
          setExportHeight={setExportHeight}
          spriteCols={spriteCols}
          setSpriteCols={setSpriteCols}
          spritePadding={spritePadding}
          setSpritePadding={setSpritePadding}
          onRemoveBackgrounds={handleRemoveBackgrounds}
          onExportZIP={handleExportZIP}
          onExportGIF={handleExportGIF}
          onExportSpriteSheet={handleExportSpriteSheet}
        />
      </main>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
