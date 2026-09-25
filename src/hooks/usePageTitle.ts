import { useEffect } from 'react';

export const SITE_NAME = 'Tanelt';

/** Sets the browser tab title to "<title> · Tanelt", or just "Tanelt" without one. */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  }, [title]);
}
