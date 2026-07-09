import { Layers, RotateCcw, Plus, Languages, Film, Grid3X3 } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

export type ToolType = 'frame' | 'split';

interface HeaderProps {
  onReset?: () => void;
  onAppendFiles?: (files: File[]) => void;
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

const HEADER_BUTTON_CLASS =
  'flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted hover:text-foreground bg-surface-hover hover:bg-hairline rounded-control transition-colors border border-hairline hover:border-primary/30';

export function Header({ onReset, onAppendFiles, activeTool, onToolChange }: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t, i18n } = useTranslation();

  const tools = [
    { id: 'frame' as const, Icon: Film, label: t('tools.frame_editor', 'Frame Editor') },
    { id: 'split' as const, Icon: Grid3X3, label: t('tools.video_splitter', 'Video Splitter') },
  ];

  const toggleLanguage = () => {
    const nextLng = i18n.language === 'en' ? 'zh' : 'en';
    i18n.changeLanguage(nextLng);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAppendFiles?.(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 w-full gap-4">
      <div className="flex items-center gap-6">
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

        {/* Tool Switcher — desktop (icons + labels) */}
        <ToolSwitcher tools={tools} activeTool={activeTool} onToolChange={onToolChange} showLabels className="hidden sm:flex" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Tool Switcher — mobile (icons only) */}
        <ToolSwitcher tools={tools} activeTool={activeTool} onToolChange={onToolChange} showLabels={false} className="flex sm:hidden mr-auto" />

        {activeTool === 'frame' && onAppendFiles && (
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

        {activeTool === 'frame' && onReset && (
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
    </header>
  );
}

function ToolSwitcher({
  tools,
  activeTool,
  onToolChange,
  showLabels,
  className,
}: {
  tools: { id: ToolType; Icon: typeof Film; label: string }[];
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  showLabels: boolean;
  className: string;
}) {
  return (
    <div className={`bg-surface-hover border border-hairline rounded-control p-1 ${className}`}>
      {tools.map(({ id, Icon, label }) => (
        <button
          key={id}
          onClick={() => onToolChange(id)}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
            activeTool === id ? 'bg-background shadow text-foreground' : 'text-muted hover:text-foreground'
          }`}
        >
          <Icon className="w-4 h-4" />
          {showLabels && label}
        </button>
      ))}
    </div>
  );
}
