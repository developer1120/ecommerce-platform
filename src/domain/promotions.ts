import { lineTotal, type CartLine } from './cart';
import { formatMoney, percentOf, sumCents, type Cents } from './money';
import type { Department } from './product';

/*
 * Promo codes. Redeeming a code fetches its rules; evaluating them against
 * the bag happens here, so the discount stays correct as the bag changes.
 */

export type PromotionKind = 'percent' | 'fixed' | 'free-shipping';

export interface Promotion {
  code: string;
  /** What the shopper gets, in words: "10% off your order". */
  description: string;
  kind: PromotionKind;
  /** A percentage for "percent", cents for "fixed", unused for "free-shipping". */
  value: number;
  /** The whole bag must reach this subtotal. */
  minSubtotal?: Cents;
  /** The most a percent code can take off. */
  maxDiscount?: Cents;
  /** Only items from these departments count. */
  departments?: Department[];
  /** Items already on sale don't count. */
  excludeSale?: boolean;
  /** ISO dates the code is valid between, inclusive. */
  startsAt?: string;
  endsAt?: string;
}

export type PromoProblem = 'not-started' | 'expired' | 'min-subtotal' | 'no-eligible-items';

export type PromoEvaluation =
  | {
      ok: true;
      promotion: Promotion;
      discount: Cents;
      /** Each line's share of the discount, summing exactly to it. */
      lineDiscounts: Record<string, Cents>;
      freeShipping: boolean;
    }
  | { ok: false; promotion: Promotion; problem: PromoProblem; message: string };

/** What the engine needs to know about each product in the bag. */
export type ProductLookup = (productId: string) => { department: Department } | undefined;

/** "  welcome 10 " → "WELCOME10". */
export function normalizeCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function endOfDay(isoDate: string): number {
  return new Date(`${isoDate.slice(0, 10)}T23:59:59.999Z`).getTime();
}

function startOfDay(isoDate: string): number {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`).getTime();
}

/** Problems that make a code unusable whatever is in the bag. */
export function dateProblem(promotion: Promotion, now: Date): { problem: PromoProblem; message: string } | null {
  if (promotion.startsAt && now.getTime() < startOfDay(promotion.startsAt)) {
    return {
      problem: 'not-started',
      message: `${promotion.code} starts on ${DATE_FORMAT.format(new Date(promotion.startsAt))}.`,
    };
  }
  if (promotion.endsAt && now.getTime() > endOfDay(promotion.endsAt)) {
    return {
      problem: 'expired',
      message: `${promotion.code} ended on ${DATE_FORMAT.format(new Date(promotion.endsAt))}.`,
    };
  }
  return null;
}

function isEligible(line: CartLine, promotion: Promotion, lookup: ProductLookup): boolean {
  if (promotion.excludeSale && line.compareAtPrice !== undefined) return false;
  if (promotion.departments) {
    const department = lookup(line.productId)?.department;
    if (!department || !promotion.departments.includes(department)) return false;
  }
  return true;
}

/**
 * Splits a discount across lines in proportion to their totals. Each share
 * is rounded down, then the leftover cents go to the largest remainders, so
 * the shares always add up to exactly the discount.
 */
export function allocate(total: Cents, weights: Record<string, Cents>): Record<string, Cents> {
  const entries = Object.entries(weights);
  const sum = sumCents(entries.map(([, weight]) => weight));
  if (sum === 0 || total === 0) return Object.fromEntries(entries.map(([key]) => [key, 0]));

  const shares = entries.map(([key, weight]) => {
    const exact = (total * weight) / sum;
    return { key, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = total - sumCents(shares.map((share) => share.floor));
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder);
  for (const share of byRemainder) {
    if (leftover === 0) break;
    share.floor += 1;
    leftover -= 1;
  }
  return Object.fromEntries(shares.map((share) => [share.key, share.floor]));
}

function eligibilityWords(promotion: Promotion): string {
  const parts: string[] = [];
  if (promotion.departments) parts.push(`${promotion.departments.join(' and ')} items`);
  else parts.push('items');
  if (promotion.excludeSale) parts.push('that are not already on sale');
  return parts.join(' ');
}

export function evaluatePromotion(
  promotion: Promotion,
  lines: CartLine[],
  lookup: ProductLookup,
  now: Date,
): PromoEvaluation {
  const timing = dateProblem(promotion, now);
  if (timing) return { ok: false, promotion, ...timing };

  const subtotal = sumCents(lines.map(lineTotal));
  if (promotion.minSubtotal !== undefined && subtotal < promotion.minSubtotal) {
    return {
      ok: false,
      promotion,
      problem: 'min-subtotal',
      message: `Add ${formatMoney(promotion.minSubtotal - subtotal)} more to use ${promotion.code}.`,
    };
  }

  if (promotion.kind === 'free-shipping') {
    return { ok: true, promotion, discount: 0, lineDiscounts: {}, freeShipping: true };
  }

  const eligible = lines.filter((line) => isEligible(line, promotion, lookup));
  if (eligible.length === 0) {
    return {
      ok: false,
      promotion,
      problem: 'no-eligible-items',
      message: `${promotion.code} works on ${eligibilityWords(promotion)}, and your bag has none.`,
    };
  }

  const weights = Object.fromEntries(eligible.map((line) => [line.variantId, lineTotal(line)]));
  const eligibleSubtotal = sumCents(Object.values(weights));
  let discount =
    promotion.kind === 'percent' ? percentOf(eligibleSubtotal, promotion.value) : Math.min(promotion.value, eligibleSubtotal);
  if (promotion.maxDiscount !== undefined) discount = Math.min(discount, promotion.maxDiscount);

  return { ok: true, promotion, discount, lineDiscounts: allocate(discount, weights), freeShipping: false };
}
