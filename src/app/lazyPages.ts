import { lazyPage } from './lazyPage';

/*
 * Pages most visits never reach load on demand, each in its own chunk:
 * the account area, checkout and the admin tools. The storefront stays in
 * the main bundle, so browsing is instant.
 */

// Account
export const AccountLayout = lazyPage('AccountLayout', () => import('@/pages/account/AccountLayout').then((m) => m.AccountLayout));
export const OrdersPage = lazyPage('OrdersPage', () => import('@/pages/account/OrdersPage').then((m) => m.OrdersPage));
export const ReturnRequestPage = lazyPage('ReturnRequestPage', () =>
  import('@/pages/account/ReturnRequestPage').then((m) => m.ReturnRequestPage),
);
export const ReturnsPage = lazyPage('ReturnsPage', () => import('@/pages/account/ReturnsPage').then((m) => m.ReturnsPage));
export const OrderDetailPage = lazyPage('OrderDetailPage', () => import('@/pages/account/OrderDetailPage').then((m) => m.OrderDetailPage));
export const MessagesPage = lazyPage('MessagesPage', () => import('@/pages/account/MessagesPage').then((m) => m.MessagesPage));
export const MessageThreadPage = lazyPage('MessageThreadPage', () =>
  import('@/pages/account/MessageThreadPage').then((m) => m.MessageThreadPage),
);
export const WorkshopBookingsPage = lazyPage('WorkshopBookingsPage', () =>
  import('@/pages/account/WorkshopBookingsPage').then((m) => m.WorkshopBookingsPage),
);
export const DetailsPage = lazyPage('DetailsPage', () => import('@/pages/account/DetailsPage').then((m) => m.DetailsPage));
export const SignInPage = lazyPage('SignInPage', () => import('@/pages/account/SignInPage').then((m) => m.SignInPage));
export const SignUpPage = lazyPage('SignUpPage', () => import('@/pages/account/SignUpPage').then((m) => m.SignUpPage));

// Checkout
export const CheckoutLayout = lazyPage('CheckoutLayout', () => import('@/pages/checkout/CheckoutLayout').then((m) => m.CheckoutLayout));
export const AddressStep = lazyPage('AddressStep', () => import('@/pages/checkout/AddressStep').then((m) => m.AddressStep));
export const DeliveryStep = lazyPage('DeliveryStep', () => import('@/pages/checkout/DeliveryStep').then((m) => m.DeliveryStep));
export const PaymentStep = lazyPage('PaymentStep', () => import('@/pages/checkout/PaymentStep').then((m) => m.PaymentStep));
export const ReviewStep = lazyPage('ReviewStep', () => import('@/pages/checkout/ReviewStep').then((m) => m.ReviewStep));
export const OrderConfirmationPage = lazyPage('OrderConfirmationPage', () =>
  import('@/pages/OrderConfirmationPage').then((m) => m.OrderConfirmationPage),
);

// Admin
export const AdminLayout = lazyPage('AdminLayout', () => import('@/pages/admin/AdminLayout').then((m) => m.AdminLayout));
export const AdminDashboardPage = lazyPage('AdminDashboardPage', () =>
  import('@/pages/admin/AdminDashboardPage').then((m) => m.AdminDashboardPage),
);
export const AdminOrdersPage = lazyPage('AdminOrdersPage', () => import('@/pages/admin/AdminOrdersPage').then((m) => m.AdminOrdersPage));
export const AdminOrderDetailPage = lazyPage('AdminOrderDetailPage', () =>
  import('@/pages/admin/AdminOrderDetailPage').then((m) => m.AdminOrderDetailPage),
);
export const AdminProductsPage = lazyPage('AdminProductsPage', () =>
  import('@/pages/admin/AdminProductsPage').then((m) => m.AdminProductsPage),
);
export const AdminProductEditPage = lazyPage('AdminProductEditPage', () =>
  import('@/pages/admin/AdminProductEditPage').then((m) => m.AdminProductEditPage),
);
export const AdminQuestionsPage = lazyPage('AdminQuestionsPage', () =>
  import('@/pages/admin/AdminQuestionsPage').then((m) => m.AdminQuestionsPage),
);

export const AdminReturnsPage = lazyPage('AdminReturnsPage', () => import('@/pages/admin/AdminReturnsPage').then((m) => m.AdminReturnsPage));
export const AdminReturnDetailPage = lazyPage('AdminReturnDetailPage', () =>
  import('@/pages/admin/AdminReturnDetailPage').then((m) => m.AdminReturnDetailPage),
);

export const AdminCustomersPage = lazyPage('AdminCustomersPage', () =>
  import('@/pages/admin/AdminCustomersPage').then((m) => m.AdminCustomersPage),
);
export const AdminCustomerDetailPage = lazyPage('AdminCustomerDetailPage', () =>
  import('@/pages/admin/AdminCustomerDetailPage').then((m) => m.AdminCustomerDetailPage),
);

export const AdminInventoryPage = lazyPage('AdminInventoryPage', () =>
  import('@/pages/admin/AdminInventoryPage').then((m) => m.AdminInventoryPage),
);
export const AdminStockPage = lazyPage('AdminStockPage', () => import('@/pages/admin/AdminStockPage').then((m) => m.AdminStockPage));

export const AdminPurchasingPage = lazyPage('AdminPurchasingPage', () =>
  import('@/pages/admin/purchasing/AdminPurchasingPage').then((m) => m.AdminPurchasingPage),
);
export const AdminSupplierPage = lazyPage('AdminSupplierPage', () =>
  import('@/pages/admin/purchasing/AdminSupplierPage').then((m) => m.AdminSupplierPage),
);
export const AdminPurchaseOrderPage = lazyPage('AdminPurchaseOrderPage', () =>
  import('@/pages/admin/purchasing/AdminPurchaseOrderPage').then((m) => m.AdminPurchaseOrderPage),
);

export const AdminWorkshopsPage = lazyPage('AdminWorkshopsPage', () => import('@/pages/admin/AdminWorkshopsPage').then((m) => m.AdminWorkshopsPage));
export const AdminWorkshopSessionPage = lazyPage('AdminWorkshopSessionPage', () =>
  import('@/pages/admin/AdminWorkshopSessionPage').then((m) => m.AdminWorkshopSessionPage),
);

export const AdminSupportPage = lazyPage('AdminSupportPage', () => import('@/pages/admin/AdminSupportPage').then((m) => m.AdminSupportPage));
export const AdminSupportTicketPage = lazyPage('AdminSupportTicketPage', () =>
  import('@/pages/admin/AdminSupportTicketPage').then((m) => m.AdminSupportTicketPage),
);

// Storefront pages most visits don't reach
export const ComparePage = lazyPage('ComparePage', () => import('@/pages/ComparePage').then((m) => m.ComparePage));
export const HelpPage = lazyPage('HelpPage', () => import('@/pages/help/HelpPage').then((m) => m.HelpPage));
export const HelpTopicPage = lazyPage('HelpTopicPage', () => import('@/pages/help/HelpTopicPage').then((m) => m.HelpTopicPage));
export const ContactPage = lazyPage('ContactPage', () => import('@/pages/help/ContactPage').then((m) => m.ContactPage));
export const JournalPage = lazyPage('JournalPage', () => import('@/pages/stories/JournalPage').then((m) => m.JournalPage));
export const JournalArticlePage = lazyPage('JournalArticlePage', () =>
  import('@/pages/stories/JournalArticlePage').then((m) => m.JournalArticlePage),
);
export const AboutPage = lazyPage('AboutPage', () => import('@/pages/stories/AboutPage').then((m) => m.AboutPage));
export const MakersPage = lazyPage('MakersPage', () => import('@/pages/stories/MakersPage').then((m) => m.MakersPage));
export const MakerPage = lazyPage('MakerPage', () => import('@/pages/stories/MakerPage').then((m) => m.MakerPage));
export const WorkshopsPage = lazyPage('WorkshopsPage', () => import('@/pages/workshops/WorkshopsPage').then((m) => m.WorkshopsPage));
export const WorkshopPage = lazyPage('WorkshopPage', () => import('@/pages/workshops/WorkshopPage').then((m) => m.WorkshopPage));

const CHECKOUT = [CheckoutLayout, AddressStep, DeliveryStep, PaymentStep, ReviewStep, OrderConfirmationPage];
const ADMIN = [AdminLayout, AdminDashboardPage, AdminOrdersPage, AdminOrderDetailPage, AdminProductsPage, AdminProductEditPage, AdminQuestionsPage, AdminReturnsPage, AdminReturnDetailPage, AdminCustomersPage, AdminCustomerDetailPage, AdminInventoryPage, AdminStockPage, AdminPurchasingPage, AdminSupplierPage, AdminPurchaseOrderPage, AdminWorkshopsPage, AdminWorkshopSessionPage, AdminSupportPage, AdminSupportTicketPage];
const STOREFRONT_EXTRAS = [ComparePage, HelpPage, HelpTopicPage, ContactPage, JournalPage, JournalArticlePage, AboutPage, MakersPage, MakerPage, WorkshopsPage, WorkshopPage];
const ACCOUNT = [AccountLayout, OrdersPage, OrderDetailPage, ReturnRequestPage, ReturnsPage, MessagesPage, MessageThreadPage, WorkshopBookingsPage, DetailsPage, SignInPage, SignUpPage];

const preloadAll = (pages: { preload: () => Promise<void> }[]) => Promise.all(pages.map((page) => page.preload())).then(() => {});

/** Called when a shopper is likely to check out soon, such as when the bag opens. */
export const preloadCheckout = () => preloadAll(CHECKOUT);
export const preloadAdmin = () => preloadAll(ADMIN);
export const preloadAccount = () => preloadAll(ACCOUNT);
/** Everything, for tests that render any page at once. */
export const preloadAllPages = () => preloadAll([...CHECKOUT, ...ADMIN, ...ACCOUNT, ...STOREFRONT_EXTRAS]);
