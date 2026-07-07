import { Layers } from 'lucide-react';

export function Header() {
  return (
    <header className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-control grid place-items-center bg-gradient-to-br from-primary to-dedupe shadow-[0_0_24px_var(--accent-glow)] shrink-0">
          <Layers className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight">FrameForge</h1>
          <p className="text-xs text-muted leading-tight mt-0.5">
            Browser-based frame extractor
          </p>
        </div>
      </div>
    </header>
  );
}
