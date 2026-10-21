import { CATALOG } from '@/data/catalog';
import { lineTotal, makeCartLine } from './cart';
import type { Order, OrderStatus } from './order';
import type { Product } from './product';
import { buildSalesReport, LOW_STOCK_ROWS, percentChange, periodsFor, totalsOf } from './salesReport';

const NOW = new Date('2026-10-07T19:00:00Z');
const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;

let count = 0;
function orderOf(
  placedAt: string,
  items: [slug: string, quantity: number][],
  { status = 'placed', discount = 0, promoCode }: { status?: OrderStatus; discount?: number; promoCode?: string } = {},
): Order {
  const lines = items.map(([slug, quantity]) => {
    const product = bySlug(slug);
    return { ...makeCartLine(product, product.variants[0]!), quantity };
  });
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  count += 1;
  return {
    id: `OR-TEST-${count}`,
    placedAt,
    status,
    email: 'ada@example.com',
    address: { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', line1: '1 Way', line2: '', city: 'Brooklyn', state: 'NY', zip: '11201', phone: '' },
    shipping: { methodId: 'standard', label: 'Standard', earliest: placedAt, latest: placedAt },
    card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada Lovelace' },
    lines,
    ...(promoCode && { promoCode }),
    totals: { subtotal, discount, shipping: 0, tax: 0, taxRate: 0, total: subtotal - discount },
  };
}

describe('periodsFor', () => {
  it('covers whole UTC days up to and including today, and the stretch before', () => {
    const { current, previous } = periodsFor(NOW, 7);
    expect(current.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(previous.start.toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(previous.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('totals', () => {
  it('counts net sales without cancelled orders', () => {
    const totals = totalsOf([
      orderOf('2026-10-07T10:00:00Z', [['washed-linen-throw', 1]], { discount: 1000 }),
      orderOf('2026-10-07T11:00:00Z', [['cedar-and-vetiver-soap', 3]]),
      orderOf('2026-10-07T12:00:00Z', [['washed-linen-throw', 5]], { status: 'cancelled' }),
    ]);
    expect(totals).toEqual({ netSales: 12200, orders: 2, averageOrder: 6100, items: 4 });
    expect(totalsOf([])).toEqual({ netSales: 0, orders: 0, averageOrder: 0, items: 0 });
  });

  it('compares with the period before', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(12200, 8600)).toBe(42);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});

describe('buildSalesReport', () => {
  const orders = [
    orderOf('2026-10-07T18:59:00Z', [['washed-linen-throw', 1]], { discount: 1000, promoCode: 'TAKE10' }),
    orderOf('2026-10-05T09:00:00Z', [['cedar-and-vetiver-soap', 3], ['washed-linen-throw', 1]]),
    // The first moment of the period counts; the period before doesn't.
    orderOf('2026-10-01T00:00:00Z', [['cedar-and-vetiver-soap', 1]], { status: 'delivered' }),
    orderOf('2026-09-30T23:59:59Z', [['washed-linen-throw', 1]], { status: 'shipped', discount: 1000, promoCode: 'TAKE10' }),
    orderOf('2026-10-06T12:00:00Z', [['washed-linen-throw', 2]], { status: 'cancelled' }),
    orderOf('2026-10-02T12:00:00Z', [['cedar-and-vetiver-soap', 1]], { status: 'packed' }),
  ];
  const report = buildSalesReport(orders, CATALOG, NOW, 7);

  it('sums this period and the one before', () => {
    expect(report.current).toEqual({ netSales: 8600 + 13200 + 1200 + 1200, orders: 4, averageOrder: 6050, items: 7 });
    expect(report.previous).toEqual({ netSales: 8600, orders: 1, averageOrder: 8600, items: 1 });
    expect(report.cancelled).toBe(1);
  });

  it('fills every day, empty ones included', () => {
    expect(report.daily.map((day) => [day.date, day.netSales, day.orders])).toEqual([
      ['2026-10-01', 1200, 1],
      ['2026-10-02', 1200, 1],
      ['2026-10-03', 0, 0],
      ['2026-10-04', 0, 0],
      ['2026-10-05', 13200, 1],
      ['2026-10-06', 0, 0],
      ['2026-10-07', 8600, 1],
    ]);
  });

  it('ranks products, departments and promo codes', () => {
    expect(report.topProducts.map((product) => [product.name, product.units, product.sales])).toEqual([
      ['Washed linen throw', 2, 19200],
      ['Cedar and vetiver soap', 5, 6000],
    ]);
    expect(report.departments).toEqual([
      { department: 'home', sales: 19200, share: 19200 / 25200 },
      { department: 'beauty', sales: 6000, share: 6000 / 25200 },
    ]);
    expect(report.promos).toEqual([{ code: 'TAKE10', orders: 1, discount: 1000 }]);
  });

  it('counts the work waiting whenever it was ordered', () => {
    const old = orderOf('2026-01-01T00:00:00Z', [['washed-linen-throw', 1]]);
    const withOld = buildSalesReport([...orders, old], CATALOG, NOW, 7);
    expect(withOld.toPack).toBe(3);
    expect(withOld.toShip).toBe(1);
    expect(withOld.current).toEqual(report.current);
  });

  it('files products no longer in the catalog under other', () => {
    const gone = orderOf('2026-10-07T10:00:00Z', [['washed-linen-throw', 1]]);
    gone.lines[0] = { ...gone.lines[0]!, productId: 'retired' };
    expect(buildSalesReport([gone], CATALOG, NOW, 7).departments).toEqual([{ department: 'other', sales: 9600, share: 1 }]);
  });

  it('lists the lowest stock among products on sale', () => {
    const [vase, throwBlanket, soap] = structuredClone(
      ['hand-thrown-bud-vase', 'washed-linen-throw', 'cedar-and-vetiver-soap'].map(bySlug),
    ) as [Product, Product, Product];
    const setStock = (product: Product, stock: number) => product.variants.forEach((variant) => (variant.stock = stock));
    setStock(vase, 3);
    setStock(throwBlanket, 0);
    setStock(soap, 0);
    soap.status = 'draft';
    const low = buildSalesReport([], [vase, throwBlanket, soap], NOW, 7).lowStock;
    // Sold out first, then the fewest left; drafts aren't on sale, so they're left out.
    expect(low.map((item) => [item.name, item.stock])).toEqual([
      ...throwBlanket.variants.map(() => ['Washed linen throw', 0]),
      ...vase.variants.map(() => ['Hand-thrown bud vase', 3]),
    ].slice(0, LOW_STOCK_ROWS));
    expect(low[0]!.option).toBe(Object.values(throwBlanket.variants[0]!.options).join(' / '));
  });

  it('shows at most a handful of low-stock rows', () => {
    const catalog: Product[] = structuredClone(CATALOG);
    catalog.forEach((product) => product.variants.forEach((variant) => (variant.stock = 1)));
    expect(buildSalesReport([], catalog, NOW, 7).lowStock).toHaveLength(LOW_STOCK_ROWS);
  });
});
