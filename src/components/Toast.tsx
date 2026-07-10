import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: { label: string; onClick: () => void };
}

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const TINT: Record<ToastType, string> = {
  success: 'text-primary',
  error: 'text-destructive',
  info: 'text-matte',
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,360px)]">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const Icon = ICONS[toast.type];
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className="toast-in glass-panel rounded-control shadow-pop p-3 pr-2 flex items-start gap-3"
    >
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${TINT[toast.type]}`} aria-hidden="true" />
      <p className="text-sm text-foreground leading-snug flex-1">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={toast.action.onClick}
          className="shrink-0 min-h-8 rounded-sm px-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 grid place-items-center w-8 h-8 rounded-sm text-muted hover:text-foreground hover:bg-white/5 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
