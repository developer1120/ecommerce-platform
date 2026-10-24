import { Navigate, type RouteObject } from 'react-router';
import { RouteError } from '@/components/feedback/RouteError';
import { RootLayout } from '@/layout/RootLayout';
import { CartPage } from '@/pages/CartPage';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProductPage } from '@/pages/ProductPage';
import { SearchPage } from '@/pages/SearchPage';
import { ShopPage } from '@/pages/ShopPage';
import { WishlistPage } from '@/pages/WishlistPage';
import {
  AboutPage,
  AccountLayout,
  AddressStep,
  AdminCustomerDetailPage,
  AdminCustomersPage,
  AdminDashboardPage,
  AdminInventoryPage,
  AdminLayout,
  AdminOrderDetailPage,
  AdminOrdersPage,
  AdminProductEditPage,
  AdminProductsPage,
  AdminPurchaseOrderPage,
  AdminPurchasingPage,
  AdminQuestionsPage,
  AdminReturnDetailPage,
  AdminReturnsPage,
  AdminStockPage,
  AdminSupplierPage,
  AdminSupportPage,
  AdminSupportTicketPage,
  AdminWorkshopSessionPage,
  AdminWorkshopsPage,
  CheckoutLayout,
  ComparePage,
  ContactPage,
  DeliveryStep,
  DetailsPage,
  HelpPage,
  HelpTopicPage,
  JournalArticlePage,
  JournalPage,
  MakerPage,
  MakersPage,
  MessagesPage,
  MessageThreadPage,
  OrderConfirmationPage,
  OrderDetailPage,
  ReturnRequestPage,
  ReturnsPage,
  OrdersPage,
  PaymentStep,
  ReviewStep,
  SignInPage,
  SignUpPage,
  WorkshopBookingsPage,
  WorkshopPage,
  WorkshopsPage,
} from './lazyPages';

/**
 * Puts routes behind an error boundary: if one of their pages crashes, the
 * message shows in its place and the layout around it keeps working.
 */
function guarded(children: RouteObject[]): RouteObject[] {
  return [{ errorElement: <RouteError />, children }];
}

/** Shared by the browser router and the memory router used in tests. */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    // Only reached if the layout itself fails, so this one draws its own frame.
    errorElement: <RouteError standalone />,
    children: guarded([
      { index: true, element: <HomePage /> },
      { path: 'shop', element: <ShopPage /> },
      { path: 'shop/:category', element: <ShopPage /> },
      { path: 'product/:slug', element: <ProductPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'wishlist', element: <WishlistPage /> },
      { path: 'compare', element: <ComparePage /> },
      { path: 'help', element: <HelpPage /> },
      { path: 'help/contact', element: <ContactPage /> },
      { path: 'help/:topic', element: <HelpTopicPage /> },
      { path: 'journal', element: <JournalPage /> },
      { path: 'journal/:slug', element: <JournalArticlePage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'about/makers', element: <MakersPage /> },
      { path: 'about/makers/:slug', element: <MakerPage /> },
      { path: 'workshops', element: <WorkshopsPage /> },
      { path: 'workshops/:slug', element: <WorkshopPage /> },
      {
        path: 'checkout',
        element: <CheckoutLayout />,
        children: guarded([
          { index: true, element: <AddressStep /> },
          { path: 'delivery', element: <DeliveryStep /> },
          { path: 'payment', element: <PaymentStep /> },
          { path: 'review', element: <ReviewStep /> },
        ]),
      },
      { path: 'orders/:orderId', element: <OrderConfirmationPage /> },
      { path: 'account/sign-in', element: <SignInPage /> },
      { path: 'account/sign-up', element: <SignUpPage /> },
      {
        path: 'account',
        element: <AccountLayout />,
        children: guarded([
          { index: true, element: <Navigate to="orders" replace /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:orderId', element: <OrderDetailPage /> },
          { path: 'orders/:orderId/return', element: <ReturnRequestPage /> },
          { path: 'returns', element: <ReturnsPage /> },
          { path: 'messages', element: <MessagesPage /> },
          { path: 'messages/:ticketId', element: <MessageThreadPage /> },
          { path: 'workshops', element: <WorkshopBookingsPage /> },
          { path: 'details', element: <DetailsPage /> },
        ]),
      },
      {
        path: 'admin',
        element: <AdminLayout />,
        children: guarded([
          { index: true, element: <AdminDashboardPage /> },
          { path: 'orders', element: <AdminOrdersPage /> },
          { path: 'orders/:orderId', element: <AdminOrderDetailPage /> },
          { path: 'products', element: <AdminProductsPage /> },
          { path: 'products/new', element: <AdminProductEditPage /> },
          { path: 'products/:productId', element: <AdminProductEditPage /> },
          { path: 'questions', element: <AdminQuestionsPage /> },
          { path: 'returns', element: <AdminReturnsPage /> },
          { path: 'returns/:returnId', element: <AdminReturnDetailPage /> },
          { path: 'inventory', element: <AdminInventoryPage /> },
          { path: 'inventory/:variantId', element: <AdminStockPage /> },
          { path: 'purchasing', element: <AdminPurchasingPage /> },
          { path: 'purchasing/makers/:supplier', element: <AdminSupplierPage /> },
          { path: 'purchasing/:poId', element: <AdminPurchaseOrderPage /> },
          { path: 'customers', element: <AdminCustomersPage /> },
          { path: 'customers/:customerKey', element: <AdminCustomerDetailPage /> },
          { path: 'workshops', element: <AdminWorkshopsPage /> },
          { path: 'workshops/:sessionId', element: <AdminWorkshopSessionPage /> },
          { path: 'support', element: <AdminSupportPage /> },
          { path: 'support/:ticketId', element: <AdminSupportTicketPage /> },
        ]),
      },
      { path: '*', element: <NotFoundPage /> },
    ]),
  },
];
