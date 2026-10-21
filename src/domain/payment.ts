/*
 * Card checks for the demo checkout. Nothing here talks to a payment
 * provider: it validates what was typed and keeps only what a receipt
 * needs. The full card number and the CVC are never stored.
 */

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover';

export const BRAND_NAMES: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
};

/** Published test numbers; the demo gateway approves the first and declines the second. */
export const TEST_CARDS = {
  approved: '4242 4242 4242 4242',
  declined: '4000 0000 0000 0002',
} as const;

export interface CardInput {
  name: string;
  number: string;
  /** "MM / YY" as typed. */
  expiry: string;
  cvc: string;
}

export type CardField = keyof CardInput;
export type CardErrors = Partial<Record<CardField, string>>;
export const CARD_FIELDS: CardField[] = ['name', 'number', 'expiry', 'cvc'];

/** What checkout keeps about a card: enough for the review page and the receipt. */
export interface SavedCard {
  brand: CardBrand;
  last4: string;
  expMonth: number;
  expYear: number;
  name: string;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function detectBrand(number: string): CardBrand | null {
  const digits = digitsOnly(number);
  if (/^4/.test(digits)) return 'visa';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'discover';
  const firstFour = Number(digits.slice(0, 4));
  if (/^5[1-5]/.test(digits) || (firstFour >= 2221 && firstFour <= 2720)) return 'mastercard';
  return null;
}

function expectedLengths(brand: CardBrand | null): number[] {
  if (brand === 'amex') return [15];
  if (brand === 'visa') return [13, 16, 19];
  return [16];
}

export function cvcLength(brand: CardBrand | null): number {
  return brand === 'amex' ? 4 : 3;
}

/** The Luhn checksum every card number carries in its last digit. */
export function passesLuhn(number: string): boolean {
  const digits = digitsOnly(number);
  if (digits.length < 12) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Groups digits as they appear on the card: 4-4-4-4, or 4-6-5 for American Express. */
export function formatCardNumber(value: string): string {
  const digits = digitsOnly(value).slice(0, 19);
  const groups = detectBrand(digits) === 'amex' ? [4, 6, 5] : [4, 4, 4, 4, 3];
  const parts: string[] = [];
  let index = 0;
  for (const size of groups) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  return parts.join(' ');
}

/** "0429" or "4/29" → "04 / 29" while typing. */
export function formatExpiry(value: string): string {
  let digits = digitsOnly(value).slice(0, 4);
  // A leading month digit above 1 can only be a single-digit month.
  if (digits.length >= 1 && Number(digits[0]) > 1) digits = `0${digits}`.slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

export function parseExpiry(value: string): { month: number; year: number } | null {
  const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;
  return { month, year: 2000 + Number(match[2]) };
}

export function validateCardField(field: CardField, card: CardInput, now: Date): string | undefined {
  const brand = detectBrand(card.number);
  switch (field) {
    case 'name':
      return card.name.trim() ? undefined : 'Enter the name on the card';
    case 'number': {
      const digits = digitsOnly(card.number);
      if (!digits) return 'Enter the card number';
      if (!brand) return 'We accept Visa, Mastercard, American Express and Discover';
      if (!expectedLengths(brand).includes(digits.length)) return `Enter all the digits of your ${BRAND_NAMES[brand]} number`;
      if (!passesLuhn(digits)) return 'That card number has a typo. Check it and try again';
      return undefined;
    }
    case 'expiry': {
      if (!card.expiry.trim()) return 'Enter the expiry date';
      const parsed = parseExpiry(card.expiry);
      if (!parsed) return 'Enter the expiry date as MM / YY';
      // Cards work until the end of their expiry month.
      const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
      const cardMonth = parsed.year * 12 + parsed.month;
      if (cardMonth < currentMonth) return 'This card has expired';
      if (cardMonth > currentMonth + 20 * 12) return 'Check the expiry year';
      return undefined;
    }
    case 'cvc': {
      const digits = digitsOnly(card.cvc);
      if (!digits) return 'Enter the security code';
      const length = cvcLength(brand);
      return digits.length === length ? undefined : `Enter the ${length}-digit security code`;
    }
  }
}

export function validateCard(card: CardInput, now: Date): CardErrors {
  const errors: CardErrors = {};
  for (const field of CARD_FIELDS) {
    const error = validateCardField(field, card, now);
    if (error) errors[field] = error;
  }
  return errors;
}

/** Keeps only the safe parts of a valid card. */
export function toSavedCard(card: CardInput): SavedCard {
  const digits = digitsOnly(card.number);
  const expiry = parseExpiry(card.expiry);
  const brand = detectBrand(digits);
  if (!expiry || !brand) throw new Error('toSavedCard needs a validated card');
  return { brand, last4: digits.slice(-4), expMonth: expiry.month, expYear: expiry.year, name: card.name.trim() };
}

/** "Visa ending 4242". */
export function describeCard(card: SavedCard): string {
  return `${BRAND_NAMES[card.brand]} ending ${card.last4}`;
}

export function formatCardExpiry(card: SavedCard): string {
  return `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`;
}
