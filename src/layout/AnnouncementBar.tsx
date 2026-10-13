import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import styles from './AnnouncementBar.module.css';

export const ROTATE_EVERY_MS = 6000;

interface AnnouncementBarProps {
  messages: string[];
}

/**
 * A thin bar of rotating store messages. Rotation pauses while the pointer or
 * keyboard focus is inside, and a button stops it for good (WCAG 2.2.2).
 */
export function AnnouncementBar({ messages }: AnnouncementBarProps) {
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hovering, setHovering] = useState(false);
  const canRotate = messages.length > 1;
  const paused = stopped || hovering;

  useEffect(() => {
    if (!canRotate || paused) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % messages.length), ROTATE_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [canRotate, paused, messages.length]);

  if (messages.length === 0) return null;

  return (
    <section
      className={styles.bar}
      aria-label="Store announcements"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      <p aria-live={paused ? 'polite' : 'off'}>
        {/* Keyed so each new message replays the fade-in. */}
        <span key={index} className={styles.message}>
          {messages[index % messages.length]}
        </span>
      </p>
      {canRotate && (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setStopped((value) => !value)}
          aria-label={stopped ? 'Play announcements' : 'Pause announcements'}
        >
          {stopped ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>
      )}
    </section>
  );
}
