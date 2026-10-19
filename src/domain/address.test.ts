import {
  EMPTY_ADDRESS,
  formatAddress,
  isCompleteAddress,
  normalizeAddress,
  normalizePhone,
  normalizeZip,
  validateAddress,
  type ShippingAddress,
} from './address';

const good: ShippingAddress = {
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  line1: '12 Analytical Way',
  line2: '',
  city: 'Brooklyn',
  state: 'NY',
  zip: '11201',
  phone: '',
};

describe('normalizing', () => {
  it('tidies spacing and case', () => {
    expect(
      normalizeAddress({
        ...good,
        email: '  Ada@Example.COM ',
        firstName: '  Ada  ',
        line1: '12   Analytical   Way ',
        state: 'ny',
      }),
    ).toMatchObject({ email: 'ada@example.com', firstName: 'Ada', line1: '12 Analytical Way', state: 'NY' });
  });

  it('formats ZIP+4 and US phone numbers', () => {
    expect(normalizeZip('112011234')).toBe('11201-1234');
    expect(normalizeZip(' 11201 ')).toBe('11201');
    expect(normalizePhone('415 555 0100')).toBe('(415) 555-0100');
    expect(normalizePhone('+1 (415) 555-0100')).toBe('(415) 555-0100');
    expect(normalizePhone('555-0100')).toBe('555-0100');
  });
});

describe('validateAddress', () => {
  it('accepts a complete address', () => {
    expect(validateAddress(good)).toEqual({});
    expect(isCompleteAddress(good)).toBe(true);
  });

  it('lists every missing required field, leaving optional ones alone', () => {
    expect(Object.keys(validateAddress(EMPTY_ADDRESS))).toEqual([
      'email',
      'firstName',
      'lastName',
      'line1',
      'city',
      'state',
      'zip',
    ]);
    expect(isCompleteAddress(EMPTY_ADDRESS)).toBe(false);
    expect(isCompleteAddress(null)).toBe(false);
  });

  it.each([
    ['ada@', 'Enter an email address like name@example.com'],
    ['ada@example', 'Enter an email address like name@example.com'],
    ['ada example@x.com', 'Enter an email address like name@example.com'],
  ])('rejects the email %j', (email, message) => {
    expect(validateAddress({ ...good, email }).email).toBe(message);
  });

  it('wants a building number unless it is a PO box', () => {
    expect(validateAddress({ ...good, line1: 'Analytical Way' }).line1).toBe('Include the house or building number');
    expect(validateAddress({ ...good, line1: 'P.O. Box 42' }).line1).toBeUndefined();
    expect(validateAddress({ ...good, line1: 'PO Box 42' }).line1).toBeUndefined();
  });

  it('checks the ZIP format and that it belongs to the state', () => {
    expect(validateAddress({ ...good, zip: '1120' }).zip).toBe('Enter a 5-digit ZIP code, like 94107');
    expect(validateAddress({ ...good, zip: '94107' }).zip).toBe("That ZIP code isn't in New York. Check the ZIP or the state.");
    expect(validateAddress({ ...good, zip: '11201-1234' }).zip).toBeUndefined();
    expect(validateAddress({ ...good, state: 'CA', zip: '94107' }).zip).toBeUndefined();
    expect(validateAddress({ ...good, state: 'AK', zip: '99501' }).zip).toBeUndefined();
  });

  it('rejects a state that is not on the list', () => {
    expect(validateAddress({ ...good, state: 'XX' }).state).toBe('Choose a state from the list');
  });

  it('allows a blank phone but checks a filled one', () => {
    expect(validateAddress({ ...good, phone: '415 555 0100' }).phone).toBeUndefined();
    expect(validateAddress({ ...good, phone: '555-0100' }).phone).toBe('Enter a 10-digit US phone number, or leave it blank');
  });
});

describe('formatAddress', () => {
  it('gives the lines to print, skipping an empty second line', () => {
    expect(formatAddress(good)).toEqual(['Ada Lovelace', '12 Analytical Way', 'Brooklyn, NY 11201']);
    expect(formatAddress({ ...good, line2: 'Apt 3' })).toContain('Apt 3');
  });
});
