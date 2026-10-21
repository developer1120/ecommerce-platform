import { CATALOG } from '@/data/catalog';
import { PROMOTIONS } from '@/data/promotions';
import { redeemPromotion } from '@/api/promotionsApi';
import { makeCartLine, type CartLine } from './cart';
import { allocate, evaluatePromotion, normalizeCode, type ProductLookup, type Promotion } from './promotions';

const NOW = new Date('2026-10-07T19:00:00Z');
const byId = new Map(CATALOG.map((product) => [product.id, product]));
const lookup: ProductLookup = (id) => byId.get(id);
const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;
const promo = (code: string) => PROMOTIONS.find((candidate) => candidate.code === code)!;

function line(slug: string, quantity = 1, variantIndex = 0): CartLine {
  const product = bySlug(slug);
  return { ...makeCartLine(product, product.variants[variantIndex]!), quantity };
}

const soap = line('cedar-and-vetiver-soap', 2); // beauty, $24.00
const mugs = line('stoneware-mug-set', 1); // home, on sale at $38.40
const throwBlanket = line('washed-linen-throw', 1); // home, $96.00
const tee = line('organic-cotton-tee', 1); // apparel, $36.00

function evaluate(code: string | Promotion, lines: CartLine[], now = NOW) {
  return evaluatePromotion(typeof code === 'string' ? promo(code) : code, lines, lookup, now);
}

describe('normalizeCode', () => {
  it('upper-cases and removes spaces', () => {
    expect(normalizeCode('  welcome 10 ')).toBe('WELCOME10');
  });
});

describe('allocate', () => {
  it('splits a total in proportion and always sums exactly', () => {
    expect(allocate(1000, { a: 3000, b: 1000 })).toEqual({ a: 750, b: 250 });
    const shares = allocate(100, { a: 1, b: 1, c: 1 });
    expect(Object.values(shares).reduce((sum, share) => sum + share, 0)).toBe(100);
    expect(Object.values(shares).sort()).toEqual([33, 33, 34]);
  });

  it('gives nothing when there is nothing to share', () => {
    expect(allocate(0, { a: 100 })).toEqual({ a: 0 });
    expect(allocate(500, { a: 0 })).toEqual({ a: 0 });
  });
});

describe('evaluatePromotion', () => {
  it('takes a percentage off full-price items only when sale items are excluded', () => {
    const result = evaluate('WELCOME10', [soap, mugs]);
    expect(result).toMatchObject({ ok: true, discount: 240, freeShipping: false });
    if (result.ok) expect(result.lineDiscounts).toEqual({ [soap.variantId]: 240 });
  });

  it('caps a percentage discount', () => {
    const big = { ...throwBlanket, quantity: 10 }; // $960 of full-price linen
    expect(evaluate('WELCOME10', [big])).toMatchObject({ ok: true, discount: 5000 });
  });

  it('limits a department code to that department', () => {
    const result = evaluate('HOME15', [throwBlanket, tee]);
    expect(result).toMatchObject({ ok: true, discount: 1440 });
    if (result.ok) expect(Object.keys(result.lineDiscounts)).toEqual([throwBlanket.variantId]);
  });

  it('spreads a fixed amount across lines, summing exactly', () => {
    const result = evaluate('TAKE10', [soap, tee, mugs]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.discount).toBe(1000);
    expect(Object.values(result.lineDiscounts).reduce((sum, share) => sum + share, 0)).toBe(1000);
  });

  it('never takes off more than the eligible items cost', () => {
    const tiny: Promotion = { code: 'BIG', description: '', kind: 'fixed', value: 99900 };
    expect(evaluate(tiny, [soap])).toMatchObject({ ok: true, discount: 2400 });
  });

  it('grants free shipping without a discount', () => {
    expect(evaluate('SHIPFREE', [soap])).toMatchObject({ ok: true, discount: 0, freeShipping: true });
  });

  it('explains a subtotal below the minimum', () => {
    expect(evaluate('TAKE10', [soap])).toMatchObject({
      ok: false,
      problem: 'min-subtotal',
      message: 'Add $36.00 more to use TAKE10.',
    });
  });

  it('explains when nothing in the bag qualifies', () => {
    expect(evaluate('WELCOME10', [mugs])).toMatchObject({
      ok: false,
      problem: 'no-eligible-items',
      message: 'WELCOME10 works on items that are not already on sale, and your bag has none.',
    });
    expect(evaluate('HOME15', [{ ...tee, quantity: 2 }])).toMatchObject({
      problem: 'no-eligible-items',
      message: 'HOME15 works on home items, and your bag has none.',
    });
  });

  it('checks the dates, counting the whole of the last day', () => {
    expect(evaluate('AUTUMN25', [soap])).toMatchObject({ ok: false, problem: 'expired', message: 'AUTUMN25 ended on Sep 30, 2026.' });
    expect(evaluate('AUTUMN25', [soap], new Date('2026-09-30T23:30:00Z')).ok).toBe(true);
    expect(evaluate('HOLIDAY20', [soap])).toMatchObject({ ok: false, problem: 'not-started', message: 'HOLIDAY20 starts on Nov 27, 2026.' });
  });
});

describe('redeemPromotion', () => {
  it('finds a code however it was typed', async () => {
    await expect(redeemPromotion(' take 10 ')).resolves.toMatchObject({ code: 'TAKE10' });
  });

  it('rejects unknown and out-of-date codes with a reason', async () => {
    await expect(redeemPromotion('free money')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: "FREEMONEY isn't a code we recognise. Check the spelling and try again.",
    });
    await expect(redeemPromotion('autumn25')).rejects.toMatchObject({ code: 'VALIDATION', message: 'AUTUMN25 ended on Sep 30, 2026.' });
  });
});
