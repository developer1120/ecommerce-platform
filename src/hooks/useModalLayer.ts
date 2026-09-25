import { useEffect } from 'react';

/** The app behind a modal; marked inert so neither pointer nor screen reader can reach it. */
export const APP_SHELL_SELECTOR = '[data-app-shell]';

/**
 * What every modal panel needs while open: the page behind it inert and
 * not scrolling, and Escape to close. Focus is handled by useFocusTrap.
 */
export function useModalLayer(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const shell = document.querySelector<HTMLElement>(APP_SHELL_SELECTOR);
    shell?.setAttribute('inert', '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      shell?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);
}
