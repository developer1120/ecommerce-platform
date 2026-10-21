import { lookupProduct } from '@/data/catalogLookup';
import { CATALOG } from '@/data/catalog';
import { PROMOTIONS } from '@/data/promotions';
import { findState, US_STATES } from '@/data/usStates';
import { makeCartLine, type CartLine } from './cart';
import { calculateOrderTotals } from './orderTotals';
import { evaluatePromotion } from './promotions';
import {
  addBusinessDays,
  availableMethods,
  deliveryWindow,
  dispatchDate,
  findShippingMethod,
  formatDeliveryWindow,
  quoteShipping,
  REMOTE_SURCHARGE,
} from './shipping';
import { formatRate, quoteTax } from './tax';

const standard = findShippingMethod('standard')!;
const express = findShippingMethod('express')!;
const nextDay = findShippingMethod('next-day')!;
const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;
function line(slug: string, quantity = 1): CartLine {
  const product = bySlug(slug);
  return { ...makeCartLine(product, product.variants[0]!), quantity };
}

describe('delivery dates', () => {
  // Wednesday 7 October 2026.
  const beforeCutoff = new Date('2026-10-07T15:00:00Z');
  const afterCutoff = new Date('2026-10-07T19:00:00Z');
  const saturday = new Date('2026-10-10T10:00:00Z');

  it('skips weekends when counting business days', () => {
    expect(addBusinessDays(new Date('2026-10-09T12:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-10-12');
    expect(addBusinessDays(new Date('2026-10-07T12:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-10-12');
  });

  it('dispatches today before the cutoff and the next business day after it or at weekends', () => {
    expect(dispatchDate(beforeCutoff).toISOString().slice(0, 10)).toBe('2026-10-07');
    expect(dispatchDate(afterCutoff).toISOString().slice(0, 10)).toBe('2026-10-08');
    expect(dispatchDate(saturday).toISOString().slice(0, 10)).toBe('2026-10-12');
  });

  it('formats the delivery window for each method', () => {
    expect(formatDeliveryWindow(deliveryWindow(standard, afterCutoff))).toBe('Tue, Oct 13 – Thu, Oct 15');
    expect(formatDeliveryWindow(deliveryWindow(express, afterCutoff))).toBe('Fri, Oct 9 – Mon, Oct 12');
    expect(formatDeliveryWindow(deliveryWindow(nextDay, afterCutoff))).toBe('Fri, Oct 9');
  });
});

describe('quoteShipping', () => {
  const base = { threshold: 7500, promoFreeShipping: false, remote: false };

  it('charges standard below the threshold and waives it at or above', () => {
    expect(quoteShipping(standard, { ...base, merchandiseTotal: 7499 })).toMatchObject({ price: 595 });
    expect(quoteShipping(standard, { ...base, merchandiseTotal: 7500 })).toMatchObject({ price: 0, fullPrice: 595, freeReason: 'threshold' });
  });

  it('waives standard for a free-shipping code', () => {
    expect(quoteShipping(standard, { ...base, merchandiseTotal: 100, promoFreeShipping: true })).toMatchObject({ price: 0, freeReason: 'promo' });
  });

  it('always charges for faster methods', () => {
    expect(quoteShipping(express, { ...base, merchandiseTotal: 50000, promoFreeShipping: true })).toMatchObject({ price: 1495 });
  });

  it('adds a surcharge for remote states, even when free shipping is waived from it', () => {
    expect(quoteShipping(express, { ...base, merchandiseTotal: 100, remote: true }).price).toBe(1495 + REMOTE_SURCHARGE);
    expect(quoteShipping(standard, { ...base, merchandiseTotal: 9000, remote: true })).toMatchObject({ price: 0, fullPrice: 595 + REMOTE_SURCHARGE });
  });

  it('offers no next-day delivery to remote states', () => {
    expect(availableMethods(true).map((method) => method.id)).toEqual(['standard', 'express']);
    expect(availableMethods(false)).toHaveLength(3);
  });
});

describe('quoteTax', () => {
  const california = findState('CA')!;
  const newJersey = findState('NJ')!;
  const oregon = findState('or')!;

  it('applies the state rate and rounds once, half up', () => {
    // $33.33 at 7.25% = 241.6425 cents → 242.
    expect(quoteTax(california, [{ department: 'home', amount: 3333 }], 595)).toMatchObject({ taxableAmount: 3333, tax: 242 });
  });

  it('taxes shipping only where the state does', () => {
    expect(quoteTax(newJersey, [{ department: 'home', amount: 10000 }], 1000)).toMatchObject({ taxableAmount: 11000, tax: 729 });
  });

  it('skips exempt departments and reports them', () => {
    const result = quoteTax(newJersey, [{ department: 'apparel', amount: 8800 }, { department: 'beauty', amount: 1200 }], 0);
    expect(result).toMatchObject({ taxableAmount: 1200, tax: 80, exemptDepartments: ['apparel'] });
  });

  it('charges nothing in states without sales tax', () => {
    expect(quoteTax(oregon, [{ department: 'home', amount: 50000 }], 595).tax).toBe(0);
  });

  it('formats rates without trailing zeros', () => {
    expect(formatRate(6875)).toBe('6.875%');
    expect(formatRate(6000)).toBe('6%');
    expect(formatRate(4450)).toBe('4.45%');
  });

  it('covers every state and DC with sensible rates', () => {
    expect(US_STATES).toHaveLength(51);
    expect(new Set(US_STATES.map((state) => state.code)).size).toBe(51);
    for (const state of US_STATES) expect(state.taxRate).toBeGreaterThanOrEqual(0);
    expect(US_STATES.filter((state) => state.taxRate === 0).map((state) => state.code).sort()).toEqual(['AK', 'DE', 'MT', 'NH', 'OR']);
  });
});

describe('calculateOrderTotals', () => {
  const now = new Date('2026-10-07T19:00:00Z');
  const take10 = PROMOTIONS.find((promo) => promo.code === 'TAKE10')!;

  it('adds shipping and leaves tax out until there is a destination', () => {
    const totals = calculateOrderTotals({ lines: [line('cedar-and-vetiver-soap', 2)], promo: null, method: standard, destination: undefined, lookup: lookupProduct });
    expect(totals).toMatchObject({ subtotal: 2400, discount: 0, merchandiseTotal: 2400, tax: null, total: 2995 });
    expect(totals.shipping.price).toBe(595);
  });

  it('measures free shipping after the discount', () => {
    // A $44 board and $36 of soap make $80; less $10 off that is $70, under the $75 threshold.
    const lines = [line('oak-serving-board', 1), line('cedar-and-vetiver-soap', 3)];
    const promo = evaluatePromotion(take10, lines, lookupProduct, now);
    const totals = calculateOrderTotals({ lines, promo, method: standard, destination: undefined, lookup: lookupProduct });
    expect(totals.merchandiseTotal).toBe(7000);
    expect(totals.shipping.price).toBe(595);
  });

  it('taxes each line after its share of the discount', () => {
    const lines = [line('washed-linen-throw', 1), line('organic-cotton-tee', 1)]; // $96 home + $36 apparel
    const promo = evaluatePromotion(take10, lines, lookupProduct, now);
    const totals = calculateOrderTotals({ lines, promo, method: standard, destination: findState('NJ'), lookup: lookupProduct });

    // The $10 splits 727/273 by line value; NJ exempts the tee and taxes shipping (free here).
    expect(promo.ok && promo.lineDiscounts).toEqual({ [lines[0]!.variantId]: 727, [lines[1]!.variantId]: 273 });
    expect(totals.tax).toMatchObject({ taxableAmount: 9600 - 727, exemptDepartments: ['apparel'] });
    expect(totals.tax!.tax).toBe(Math.round(((9600 - 727) * 6625) / 100_000));
    expect(totals.total).toBe(13200 - 1000 + 0 + totals.tax!.tax);
  });

  it('charges the remote surcharge to Hawaii and taxes it there', () => {
    const lines = [line('rose-clay-mask', 1)];
    const totals = calculateOrderTotals({ lines, promo: null, method: express, destination: findState('HI'), lookup: lookupProduct });
    expect(totals.shipping.price).toBe(2495);
    expect(totals.tax!.taxableAmount).toBe(2400 + 2495);
    expect(totals.total).toBe(2400 + 2495 + totals.tax!.tax);
  });
});
