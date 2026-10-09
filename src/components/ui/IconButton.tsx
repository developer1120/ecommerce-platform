import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** Accessible name. Required because the button shows no text. */
  label: string;
  icon: ReactNode;
  variant?: 'ghost' | 'secondary' | 'accent';
  size?: 'sm' | 'md';
  /** A small count shown on the corner, such as items in the bag. Hidden when zero. */
  count?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', count, type = 'button', className, ...rest },
  ref,
) {
  const showCount = count !== undefined && count > 0;
  const accessibleName = showCount ? `${label}, ${count} ${count === 1 ? 'item' : 'items'}` : label;

  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.iconButton, className)}
      data-variant={variant}
      data-size={size}
      aria-label={accessibleName}
      {...rest}
    >
      <span className={styles.glyph} aria-hidden="true">
        {icon}
      </span>
      {showCount && (
        <span className={styles.count} aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
});
