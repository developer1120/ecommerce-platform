import type { UsState } from '@/data/usStates';
import type { Cents } from './money';
import type { Department } from './product';

export interface TaxableLine {
  department: Department | undefined;
  /** The line total after any promo discount. */
  amount: Cents;
}

export interface TaxQuote {
  /** The state rate in thousandths of a percent. */
  rate: number;
  /** What the rate applies to, after exemptions. */
  taxableAmount: Cents;
  tax: Cents;
  /** Departments that were exempt in this state and present in the order. */
  exemptDepartments: Department[];
}

/** 6875 → "6.875%", 6000 → "6%". */
export function formatRate(rate: number): string {
  return `${(rate / 1000).toFixed(3).replace(/\.?0+$/, '')}%`;
}

/**
 * State sales tax on the discounted lines, plus shipping where the state
 * taxes it. The rate is applied to the whole taxable amount and rounded
 * half up once, so per-line rounding can't drift the total.
 */
export function quoteTax(state: UsState, lines: TaxableLine[], shipping: Cents): TaxQuote {
  const exempt = new Set(state.exempt ?? []);
  let taxableAmount = 0;
  const exemptDepartments = new Set<Department>();
  for (const line of lines) {
    if (line.department && exempt.has(line.department)) exemptDepartments.add(line.department);
    else taxableAmount += line.amount;
  }
  if (state.taxesShipping) taxableAmount += shipping;
  // Integers throughout: cents × thousandths of a percent, divided once.
  const tax = Math.round((taxableAmount * state.taxRate) / 100_000);
  return { rate: state.taxRate, taxableAmount, tax, exemptDepartments: [...exemptDepartments] };
}
