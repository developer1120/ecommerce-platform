import type { ReactNode } from 'react';
import { KeyRound } from 'lucide-react';
import { ProductArt } from '@/components/product/ProductArt';
import { HeadingIcon } from '@/components/ui';
import styles from './AuthPage.module.css';

interface AuthLayoutProps {
  title: string;
  intro: string;
  children: ReactNode;
}

/** A form card beside an illustrated panel, shared by sign in and sign up. */
export function AuthLayout({ title, intro, children }: AuthLayoutProps) {
  return (
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="auth-title">
        <h1 id="auth-title" className={styles.title}>
          <HeadingIcon icon={KeyRound} badge />
          {title}
        </h1>
        <p className={styles.intro}>{intro}</p>
        {children}
      </section>
      <div className={styles.aside} aria-hidden="true">
        <p className={styles.asideQuote}>
          Order history, saved addresses and a <em>wishlist</em> that follows you.
        </p>
        <div className={styles.asideArt}>
          <ProductArt art={{ tint: 'sage', motif: 'vessel' }} bare />
          <ProductArt art={{ tint: 'blush', motif: 'jar' }} bare />
        </div>
      </div>
    </div>
  );
}
