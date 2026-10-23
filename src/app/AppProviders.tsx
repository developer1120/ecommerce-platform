import type { ReactNode } from 'react';
import { AuthProvider } from '@/state/AuthProvider';
import { CartDrawerProvider } from '@/state/CartDrawerProvider';
import { CartProvider } from '@/state/CartProvider';
import { CompareProvider } from '@/state/CompareProvider';
import { PromoProvider } from '@/state/PromoProvider';
import { ToastProvider } from '@/state/ToastProvider';
import { WishlistProvider } from '@/state/WishlistProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

/** App-wide state. Tests wrap routes in the same providers. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <WishlistProvider>
            <CartProvider>
              <PromoProvider>
                <CompareProvider>
                  <CartDrawerProvider>{children}</CartDrawerProvider>
                </CompareProvider>
              </PromoProvider>
            </CartProvider>
          </WishlistProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
