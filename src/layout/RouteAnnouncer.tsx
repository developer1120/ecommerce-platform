import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

/** How long after a navigation a late title (say, a product name once it loads) is still announced. */
const LATE_TITLE_MS = 2000;

/**
 * Tells screen reader users that the page changed. A browser does this on a
 * full page load; a single-page app has to do it itself, so this announces
 * the new page title after each navigation. The first page is left alone,
 * because screen readers read it out anyway.
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const [message, setMessage] = useState('');
  const announcedFor = useRef(pathname);

  useEffect(() => {
    if (announcedFor.current === pathname) return;
    announcedFor.current = pathname;

    const announce = () => setMessage(document.title);
    announce();
    // Pages that load their content set a better title a moment later.
    const title = document.querySelector('title');
    const observer = new MutationObserver(announce);
    if (title) observer.observe(title, { childList: true, characterData: true, subtree: true });
    const stop = window.setTimeout(() => observer.disconnect(), LATE_TITLE_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(stop);
    };
  }, [pathname]);

  return (
    <p className="visually-hidden" aria-live="polite" aria-atomic="true" data-route-announcer>
      {message}
    </p>
  );
}
