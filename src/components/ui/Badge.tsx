import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'accent' | 'sale' | 'success' | 'warning' | 'inverse';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** A small decorative icon before the text. */
  icon?: ReactNode;
}

export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(styles.badge, className)} data-tone={tone} {...rest}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
