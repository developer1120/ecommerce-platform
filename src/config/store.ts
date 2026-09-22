import type { Cents } from '@/domain/money';

/** Orders at or above this subtotal ship free. */
export const FREE_SHIPPING_THRESHOLD: Cents = 7500;
