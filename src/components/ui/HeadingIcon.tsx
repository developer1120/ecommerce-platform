import type { LucideIcon } from 'lucide-react';
import { cx } from '@/lib/cx';
import styles from './HeadingIcon.module.css';

interface HeadingIconProps {
  icon: LucideIcon;
  /** A page title's lime badge, rather than a section heading's inline glyph. */
  badge?: boolean;
  className?: string;
}

/**
 * A decorative icon at the start of a heading. Hidden from screen readers,
 * so the heading's name stays just its words.
 */
export function HeadingIcon({ icon: Icon, badge = false, className }: HeadingIconProps) {
  return (
    <span className={cx(styles.icon, badge && styles.badge, className)} aria-hidden="true">
      <Icon />
    </span>
  );
}
