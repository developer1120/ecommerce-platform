import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether an element has come close to the visible part of the page, for
 * drawing things only when someone is about to see them. Once true it
 * stays true. Without IntersectionObserver, or when not enabled, it is
 * true from the start.
 */
export function useNearViewport(target: RefObject<Element | null>, enabled = true, rootMargin = '300px'): boolean {
  const [near, setNear] = useState(() => !enabled || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = target.current;
    if (near || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, target, rootMargin]);

  return near;
}
