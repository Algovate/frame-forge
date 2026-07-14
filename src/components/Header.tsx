import { Layers, RotateCcw, Plus, Languages, Film, Grid3X3 } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';

const HEADER_BUTTON_CLASS =
  'min-h-11 flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted hover:text-foreground bg-surface hover:bg-surface-hover rounded-control transition-colors border border-hairline hover:border-primary/40';

export function Header() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t, i18n } = useTranslation();
  const {
    activeTool, setActiveTool, resetWorkspace, appendFramesFromFiles, frames, isProcessing,
  } = useAppStore();
  const hasFrames = frames.length > 0;
  const isStudioActive = activeTool === 'studio' || activeTool === 'canvas-editor';

  const isZh = i18n.language?.startsWith('zh');

  const toggleLanguage = () => {
    i18n.changeLanguage(isZh ? 'en' : 'zh');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      appendFramesFromFiles?.(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <header className="flex flex-col gap-3 w-full lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3 sm:gap-6">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-control grid place-items-center bg-primary shadow-[0_2px_8px_var(--accent-glow)]">
            <Layers className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight leading-tight">{t('header.title', 'Frame Forge')}</h1>
            <p className="text-xs text-muted leading-tight mt-0.5">{t('header.subtitle', 'Browser-based frame extractor')}</p>
          </div>
        </div>

        <nav aria-label={t('nav.workspace', 'Workspace')} className="flex w-full items-stretch gap-1 rounded-control border border-hairline bg-surface-hover p-1 sm:w-auto">
          <button type="button" onClick={() => setActiveTool('studio')} aria-current={isStudioActive ? 'page' : undefined}
            className={`min-h-11 flex flex-1 items-center justify-center gap-2 rounded-sm px-3 text-xs font-medium transition-colors sm:flex-none sm:text-sm ${isStudioActive ? 'bg-surface shadow-[0_1px_2px_color-mix(in_oklab,var(--color-foreground),transparent_90%)] text-foreground' : 'text-muted hover:text-foreground'}`}>
            <Film className="w-4 h-4" aria-hidden="true" /> <span>{t('nav.studio', 'Sticker Studio')}</span>
          </button>

          <button type="button" onClick={() => setActiveTool('splitter')} aria-current={activeTool === 'splitter' ? 'page' : undefined}
            className={`min-h-11 flex flex-1 items-center justify-center gap-2 rounded-sm px-3 text-xs font-medium transition-colors sm:flex-none sm:text-sm ${activeTool === 'splitter' ? 'bg-surface shadow-[0_1px_2px_color-mix(in_oklab,var(--color-foreground),transparent_90%)] text-foreground' : 'text-muted hover:text-foreground'}`}>
            <Grid3X3 className="w-4 h-4" aria-hidden="true" /> <span>{t('nav.tools', 'Tools')}</span>
          </button>
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isStudioActive && appendFramesFromFiles && hasFrames && !isProcessing && (
          <>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*,video/*,.gif" className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className={HEADER_BUTTON_CLASS}>
              <Plus className="w-4 h-4" aria-hidden="true" /> <span>{t('header.add_frames', 'Add Frames')}</span>
            </button>
          </>
        )}
        {isStudioActive && hasFrames && !isProcessing && (
          <button type="button" onClick={resetWorkspace} className={HEADER_BUTTON_CLASS}>
            <RotateCcw className="w-4 h-4" aria-hidden="true" /> <span>{t('header.new_source', 'New Source')}</span>
          </button>
        )}
        <button type="button" onClick={toggleLanguage} className={HEADER_BUTTON_CLASS} title={isZh ? '切换到英文' : 'Switch to Chinese'}>
          <Languages className="w-4 h-4" aria-hidden="true" /> <span>{isZh ? '中' : 'EN'}</span>
        </button>
      </div>
    </header>
  );
}
