import { Suspense } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { CompareTray } from '@/components/compare/CompareTray';
import { PageFallback } from '@/components/feedback/PageFallback';
import { ANNOUNCEMENTS } from '@/config/navigation';
import { useIsCompact } from '@/hooks/useMediaQuery';
import { AnnouncementBar } from './AnnouncementBar';
import { BottomNav } from './BottomNav';
import { RouteAnnouncer } from './RouteAnnouncer';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import styles from './RootLayout.module.css';

export function RootLayout() {
  const compact = useIsCompact();
  return (
    <div className={styles.shell} data-app-shell>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <AnnouncementBar messages={ANNOUNCEMENTS} />
      <SiteHeader />
      <main id="main" tabIndex={-1} className={styles.main}>
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
      <CompareTray />
      {compact && <BottomNav />}
      <ScrollRestoration />
      <RouteAnnouncer />
      <CartDrawer />
    </div>
  );
}
