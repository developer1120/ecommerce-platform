import { findState } from '@/data/usStates';

/*
 * Contact and shipping details for checkout, US addresses only. Values are
 * normalized before validation so " 94107 " and "(415) 555 0100" pass.
 */

export interface ShippingAddress {
  email: string;
  firstName: string;
  lastName: string;
  line1: string;
  line2: string;
  city: string;
  /** Two-letter state code. */
  state: string;
  zip: string;
  /** Optional; ten digits once normalized. */
  phone: string;
}

export type AddressField = keyof ShippingAddress;
export type AddressErrors = Partial<Record<AddressField, string>>;

export const EMPTY_ADDRESS: ShippingAddress = {
  email: '',
  firstName: '',
  lastName: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
};

/** The order fields appear in on the form, so errors are listed in the same order. */
export const ADDRESS_FIELDS: AddressField[] = [
  'email',
  'firstName',
  'lastName',
  'line1',
  'line2',
  'city',
  'state',
  'zip',
  'phone',
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

/**
 * The first digit of a ZIP code names a region of states. Checking it
 * catches a mistyped ZIP or state without a full ZIP database.
 */
const ZIP_REGIONS: Record<string, string[]> = {
  '0': ['CT', 'MA', 'ME', 'NH', 'NJ', 'RI', 'VT'],
  '1': ['DE', 'NY', 'PA'],
  '2': ['DC', 'MD', 'NC', 'SC', 'VA', 'WV'],
  '3': ['AL', 'FL', 'GA', 'MS', 'TN'],
  '4': ['IN', 'KY', 'MI', 'OH'],
  '5': ['IA', 'MN', 'MT', 'ND', 'SD', 'WI'],
  '6': ['IL', 'KS', 'MO', 'NE'],
  '7': ['AR', 'LA', 'OK', 'TX'],
  '8': ['AZ', 'CO', 'ID', 'NM', 'NV', 'UT', 'WY'],
  '9': ['AK', 'CA', 'HI', 'OR', 'WA'],
};

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** "941071234" → "94107-1234"; anything else is left for validation to reject. */
export function normalizeZip(value: string): string {
  const digits = value.replace(/[\s-]/g, '');
  if (/^\d{9}$/.test(digits)) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return value.trim();
}

/** Ten US digits (an optional leading 1 is dropped) → "(415) 555-0100". */
export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return value.trim();
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function normalizeAddress(address: ShippingAddress): ShippingAddress {
  return {
    email: address.email.trim().toLowerCase(),
    firstName: collapse(address.firstName),
    lastName: collapse(address.lastName),
    line1: collapse(address.line1),
    line2: collapse(address.line2),
    city: collapse(address.city),
    state: address.state.trim().toUpperCase(),
    zip: normalizeZip(address.zip),
    phone: address.phone.trim() ? normalizePhone(address.phone) : '',
  };
}

export function validateField(field: AddressField, address: ShippingAddress): string | undefined {
  const value = address[field];
  switch (field) {
    case 'email':
      if (!value) return 'Enter your email address';
      if (!EMAIL_PATTERN.test(value)) return 'Enter an email address like name@example.com';
      return undefined;
    case 'firstName':
      return value ? undefined : 'Enter your first name';
    case 'lastName':
      return value ? undefined : 'Enter your last name';
    case 'line1':
      if (!value) return 'Enter the street address';
      if (!/\d/.test(value) && !/^p\.?\s*o\.?\s*box/i.test(value)) return 'Include the house or building number';
      return undefined;
    case 'line2':
      return undefined;
    case 'city':
      return value ? undefined : 'Enter the city';
    case 'state':
      if (!value) return 'Choose a state';
      return findState(value) ? undefined : 'Choose a state from the list';
    case 'zip': {
      if (!value) return 'Enter the ZIP code';
      if (!ZIP_PATTERN.test(value)) return 'Enter a 5-digit ZIP code, like 94107';
      const state = findState(address.state);
      if (state && !ZIP_REGIONS[value[0]!]?.includes(state.code)) {
        return `That ZIP code isn't in ${state.name}. Check the ZIP or the state.`;
      }
      return undefined;
    }
    case 'phone':
      if (!value) return undefined;
      return /^\(\d{3}\) \d{3}-\d{4}$/.test(value) ? undefined : 'Enter a 10-digit US phone number, or leave it blank';
  }
}

/** Every problem with the address, keyed by field, in form order. Empty when it is good to ship to. */
export function validateAddress(address: ShippingAddress): AddressErrors {
  const normalized = normalizeAddress(address);
  const errors: AddressErrors = {};
  for (const field of ADDRESS_FIELDS) {
    const error = validateField(field, normalized);
    if (error) errors[field] = error;
  }
  return errors;
}

export function isCompleteAddress(address: ShippingAddress | null | undefined): address is ShippingAddress {
  return Boolean(address) && Object.keys(validateAddress(address!)).length === 0;
}

/** The address as lines for display: name, street, city line. */
export function formatAddress(address: ShippingAddress): string[] {
  return [
    `${address.firstName} ${address.lastName}`,
    address.line1,
    address.line2,
    `${address.city}, ${address.state} ${address.zip}`,
  ].filter(Boolean);
}
