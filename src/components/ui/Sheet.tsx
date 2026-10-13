import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { HeadingIcon } from './HeadingIcon';
import { useModalLayer } from '@/hooks/useModalLayer';
import styles from './Sheet.module.css';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Stays in view below the scrolling body, for the sheet's main actions. */
  footer?: ReactNode;
  /** Where focus goes on close if whatever opened the sheet has gone. */
  returnFocus?: () => HTMLElement | null;
  /** Shown before the title. */
  icon?: LucideIcon;
}

/**
 * A modal panel that rises from the bottom of the screen. Like the bag
 * drawer, it traps focus, closes on Escape or a tap on the backdrop, and
 * keeps the page behind it still and out of reach.
 */
export function Sheet({ open, onClose, title, children, footer, returnFocus, icon }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalLayer(open, onClose);
  useFocusTrap(panelRef, open, returnFocus);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {icon && <HeadingIcon icon={icon} />}
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
