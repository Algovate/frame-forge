import { Loader2 } from 'lucide-react';

/** Full-cover processing overlay: spinner + status message. Shared by tools
 *  that run long ffmpeg/extract operations under an `isProcessing` flag. */
export function ProcessingOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-card bg-black/60 backdrop-blur-sm">
      <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
      <p className="text-lg font-medium">{message}</p>
    </div>
  );
}
