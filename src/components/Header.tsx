import { Layers, RotateCcw, Plus, Languages } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  onReset?: () => void;
  onAppendFiles?: (files: File[]) => void;
}

const HEADER_BUTTON_CLASS =
  'flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted hover:text-foreground bg-surface-hover hover:bg-hairline rounded-control transition-colors border border-hairline hover:border-primary/30';

export function Header({ onReset, onAppendFiles }: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLng = i18n.language === 'en' ? 'zh' : 'en';
    i18n.changeLanguage(nextLng);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAppendFiles?.(Array.from(e.target.files));
      // Clear input so the same files can be selected again
      e.target.value = '';
    }
  };
  return (
    <header className="flex items-center justify-between mb-5 w-full">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-control grid place-items-center bg-gradient-to-br from-primary to-dedupe shadow-[0_0_24px_var(--accent-glow)] shrink-0">
          <Layers className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight">{t('header.title', 'Frame Forge')}</h1>
          <p className="text-xs text-muted leading-tight mt-0.5">
            {t('header.subtitle', 'Browser-based frame extractor')}
          </p>
        </div>
      </div>

      {(onReset || onAppendFiles) && (
        <div className="flex gap-2">
          {onAppendFiles && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
                accept="image/*,video/*,.gif"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={HEADER_BUTTON_CLASS}
                title={t('header.add_frames', 'Add Frames')}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{t('header.add_frames', 'Add Frames')}</span>
              </button>
            </>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className={HEADER_BUTTON_CLASS}
              title={t('header.new_source', 'New Source')}
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">{t('header.new_source', 'New Source')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleLanguage}
            className={HEADER_BUTTON_CLASS}
            title={i18n.language === 'en' ? 'Switch to Chinese' : '切换到英文'}
          >
            <Languages className="w-4 h-4" />
            <span className="hidden sm:inline">{i18n.language === 'en' ? 'EN' : '中'}</span>
          </button>
        </div>
      )}
      {(!onReset && !onAppendFiles) && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggleLanguage}
            className={HEADER_BUTTON_CLASS}
            title={i18n.language === 'en' ? 'Switch to Chinese' : '切换到英文'}
          >
            <Languages className="w-4 h-4" />
            <span className="hidden sm:inline">{i18n.language === 'en' ? 'EN' : '中'}</span>
          </button>
        </div>
      )}
    </header>
  );
}
