# Tanelt

Tanelt is a storefront for small-batch homeware, apparel and self-care,
built as a single-page React app. Shoppers can browse, filter, search, fill a bag,
check out, and manage orders and a wishlist. A small admin lets the shop's
team manage products and orders and see how sales are going.

There is no real backend. A pretend API in `src/api` stands in for one, with
network delays, failures and server-side rules, and keeps its data in
`localStorage`. So the whole shop runs, and every flow can be tried, with
nothing to set up.

## Getting started

You need Node 20 (see `.nvmrc`).

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Script               | What it does                                     |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Starts the development server                    |
| `npm run build`      | Type-checks, then builds into `dist/`            |
| `npm run preview`    | Serves the built app                             |
| `npm test`           | Runs the test suite once                         |
| `npm run test:watch` | Runs tests on every change                       |
| `npm run typecheck`  | Type-checks without building                     |
| `npm run lint`       | Lints with ESLint                                |

## Trying it out

**Card numbers** (checkout only accepts these pretend cards):

- `4242 4242 4242 4242` is approved.
- `4000 0000 0000 0002` is declined, to see how a failed payment is handled.

Use any future expiry date and any three-digit CVC.

**Promo codes:**

| Code        | Gives                                    |
| ----------- | ---------------------------------------- |
| `WELCOME10` | 10% off full-price items                 |
| `HOME15`    | 15% off Home on orders over $50          |
| `TAKE10`    | $10 off orders over $60                  |
| `SHIPFREE`  | Free standard shipping                   |
| `AUTUMN25`  | Expired on 30 September, to see that message |
| `HOLIDAY20` | Starts on 27 November, to see that message   |

Orders over $75 ship free.

**Accounts.** Create a customer account from the sign-in page. For the admin
area, sign in with the demo admin account in `src/data/demoAccounts.ts`. It is
created on first sign-in, and like everything here it exists only in your
browser.

**Slow or failing network.** In development, add `?latency=1500` to any
address to slow every API call to 1.5 seconds. Add `?fail=0.3` to make 30% of
calls fail. This shows the loading states, retries and error messages.

To start afresh, clear the site's storage in the browser. Everything Tanelt
keeps begins with `tanelt:`.

## What's in it

**Shopping**

- Home page with new arrivals and best sellers.
- Collections with filters for category, colour, price, rating and stock.
  Filters, sort and page are kept in the address, so they can be shared and the
  back button steps through them.
- Search with suggestions as you type, recent searches and relevance-ordered
  results.
- Product pages with options, live stock, reviews, recommendations and
  "recently viewed". Shoppers can ask to be emailed when a sold-out option is
  back.
- The bag, as a drawer or a full page. It has promo codes and a shipping
  estimate, and catches price and stock changes before checkout.

**Checkout**

- Address, delivery, payment and review steps.
- The server recalculates every total. A repeated "Place order" never charges
  twice.
- Clear handling of declined cards and items that sold out mid-checkout.

**Accounts**

- Sign up, sign in and "remember me", with throttling after repeated failures.
- Order history with progress and tracking, account details, and restock
  alerts.
- A wishlist that works signed out and merges into the account on sign-in.

**Admin** (at `/admin`, for the demo admin)

- An overview of sales for 7, 30 or 90 days, compared with the period before:
  best sellers, sales by department, promo code use and stock running low.
- Orders, moved from placed to packed, shipped (with tracking) and delivered,
  or cancelled. Shoppers are emailed at each step, and cancelling restocks the
  items. Edits made at the same time by two people are caught, not overwritten.
- Products, created and edited with validation. Drafts and archived products
  stay out of the shop, and restocking emails waiting shoppers.

Emails are not sent. They are kept in a pretend outbox
(`tanelt:mock-db:outbox`) so the app and tests can check them.

## How it's built

- **React 18 and TypeScript** in strict mode, built with **Vite**.
- **React Router 7.** Routes live in `src/app/routes.tsx`. The account,
  checkout and admin pages load on demand in their own chunks
  (`src/app/lazyPages.ts`), and are preloaded when a shopper is likely to need
  them.
- **CSS Modules** with design tokens in `src/styles/tokens.css`. Light and dark
  themes come from `light-dark()`, following the system setting unless the
  shopper picks one.
- **Lucide** icons. The **Fraunces** and **Manrope** fonts are bundled, not
  fetched from a font service.

```
src/
  api/         the pretend server: catalog, orders, auth, reviews, admin
  app/         providers, routes, lazy loading, the top-level error boundary
  components/  shared UI, grouped by area (cart, product, checkout, ui, …)
  config/      navigation, collections and store settings
  data/        the catalog, promotions and demo accounts
  domain/      pure logic: money, totals, filters, search, validation, reports
  hooks/       shared React hooks
  layout/      header, footer, bottom bar and the page shell
  pages/       one component per route
  state/       React context for the bag, auth, wishlist, toasts and checkout
  styles/      global styles and design tokens
  test/        test setup and helpers
```

Business rules live in `src/domain` as plain functions with their own tests.
Components stay thin.

Money is handled in whole cents throughout, to avoid floating-point
rounding.

## Quality

- **Tests.** Vitest and Testing Library cover the domain logic, the pretend
  API and whole user journeys rendered through the real router. Run
  `npm test`.
- **Accessibility.** axe-core scans every screen, dialog and error state in
  the tests (`src/test/a11y.test.tsx`). Contrast between the design tokens is
  checked separately, because the test browser cannot measure colours.
  - The app has a skip link, focus management in dialogs and after navigation,
    and announced page changes.
  - Every control works from the keyboard and has a proper name for screen
    readers, and animation respects reduced motion.
- **Resilience.** If a page crashes, its error shows inside the layout, so
  the header and navigation keep working, with "Try again" and a way back.
  - If a page's code fails to download (after a new release, say), the error
    screen offers a reload instead.
  - Unknown addresses get a 404 page that suggests a search based on the
    address.
- **Performance.** The storefront loads first. Other areas load on demand,
  product art draws as it nears the screen, and long lists are split into
  pages.
- **Responsive.** Built for phones up. Small screens get a bottom bar for the
  main sections and a sheet for filters.
