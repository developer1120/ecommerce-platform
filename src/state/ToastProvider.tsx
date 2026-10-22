import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import styles from './Toaster.module.css';

export type ToastTone = 'success' | 'info' | 'error';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** One follow-up, such as "View bag" or "Undo". Using it dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it hides itself. */
  duration?: number;
}

interface Toast extends Required<Pick<ToastOptions, 'title' | 'tone' | 'duration'>> {
  id: number;
  description?: string;
  action?: ToastOptions['action'];
}

export const DEFAULT_TOAST_DURATION = 5000;
/** Older toasts give way once this many are showing. */
export const MAX_TOASTS = 3;

interface ToastContextValue {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = { success: CircleCheck, info: Info, error: CircleAlert } as const;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const Icon = ICONS[toast.tone];

  // The timer restarts after a pause, so a toast never vanishes while someone is reading or tabbing to it.
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, toast.duration, onDismiss]);

  return (
    <li
      className={styles.toast}
      data-tone={toast.tone}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className={styles.icon} aria-hidden="true" />
      <div className={styles.body}>
        <p className={styles.title}>{toast.title}</p>
        {toast.description && <p className={styles.description}>{toast.description}</p>}
      </div>
      {toast.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            toast.action!.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className={styles.close} aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <X aria-hidden="true" />
      </button>
    </li>
  );
}

/** Short-lived notifications in a polite live region at the bottom of the screen. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    const item: Toast = {
      id,
      title: options.title,
      tone: options.tone ?? 'success',
      duration: options.duration ?? DEFAULT_TOAST_DURATION,
      ...(options.description !== undefined && { description: options.description }),
      ...(options.action !== undefined && { action: options.action }),
    };
    setToasts((current) => [...current, item].slice(-MAX_TOASTS));
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <section className={styles.region} aria-label="Notifications">
          <ol className={styles.list} aria-live="polite" aria-relevant="additions">
            {toasts.map((item) => (
              <ToastItem key={item.id} toast={item} onDismiss={dismiss} />
            ))}
          </ol>
        </section>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
