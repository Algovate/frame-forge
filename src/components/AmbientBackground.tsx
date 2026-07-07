/**
 * Two large, blurred gradient blobs drifting slowly behind the app.
 * Fixed, below all content (-z-10), and pointer-events-none so it never
 * intercepts clicks. Animation pauses under prefers-reduced-motion (see CSS).
 * Must be a sibling of — not a child of — any .glass-panel, since
 * backdrop-filter creates a containing block for fixed descendants.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="ambient-blob ambient-blob--indigo w-[42rem] h-[42rem] -top-40 -left-32" />
      <div className="ambient-blob ambient-blob--violet w-[38rem] h-[38rem] top-1/3 -right-40" />
    </div>
  );
}
