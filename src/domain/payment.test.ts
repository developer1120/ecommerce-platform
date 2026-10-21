import {
  describeCard,
  detectBrand,
  formatCardExpiry,
  formatCardNumber,
  formatExpiry,
  parseExpiry,
  passesLuhn,
  TEST_CARDS,
  toSavedCard,
  validateCard,
  type CardInput,
} from './payment';

const NOW = new Date('2026-10-11T12:00:00Z');
const good: CardInput = { name: 'Ada Lovelace', number: TEST_CARDS.approved, expiry: '04 / 29', cvc: '123' };

describe('card brands and numbers', () => {
  it.each([
    ['4242424242424242', 'visa'],
    ['5555555555554444', 'mastercard'],
    ['2223003122003222', 'mastercard'],
    ['378282246310005', 'amex'],
    ['6011111111111117', 'discover'],
    ['9999', null],
  ])('detects %s as %s', (number, brand) => {
    expect(detectBrand(number)).toBe(brand);
  });

  it('checks the Luhn digit', () => {
    expect(passesLuhn('4242 4242 4242 4242')).toBe(true);
    expect(passesLuhn('4242 4242 4242 4241')).toBe(false);
    expect(passesLuhn('378282246310005')).toBe(true);
    expect(passesLuhn('42')).toBe(false);
  });

  it('groups digits like the card does', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('3782822463')).toBe('3782 822463');
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
    expect(formatCardNumber('42-42 abc 42')).toBe('4242 42');
  });
});

describe('expiry dates', () => {
  it('formats while typing', () => {
    expect(formatExpiry('0')).toBe('0');
    expect(formatExpiry('04')).toBe('04');
    expect(formatExpiry('0429')).toBe('04 / 29');
    expect(formatExpiry('4')).toBe('04');
    expect(formatExpiry('429')).toBe('04 / 29');
  });

  it('parses MM / YY and rejects impossible months', () => {
    expect(parseExpiry('04 / 29')).toEqual({ month: 4, year: 2029 });
    expect(parseExpiry('04/29')).toEqual({ month: 4, year: 2029 });
    expect(parseExpiry('13 / 29')).toBeNull();
    expect(parseExpiry('4/29')).toBeNull();
  });
});

describe('validateCard', () => {
  it('accepts a good card', () => {
    expect(validateCard(good, NOW)).toEqual({});
  });

  it('asks for everything when empty', () => {
    expect(validateCard({ name: '', number: '', expiry: '', cvc: '' }, NOW)).toEqual({
      name: 'Enter the name on the card',
      number: 'Enter the card number',
      expiry: 'Enter the expiry date',
      cvc: 'Enter the security code',
    });
  });

  it('explains what is wrong with a number', () => {
    expect(validateCard({ ...good, number: '9111 1111 1111 1111' }, NOW).number).toBe(
      'We accept Visa, Mastercard, American Express and Discover',
    );
    expect(validateCard({ ...good, number: '4242 4242 4242' }, NOW).number).toBe('Enter all the digits of your Visa number');
    expect(validateCard({ ...good, number: '4242 4242 4242 4241' }, NOW).number).toBe(
      'That card number has a typo. Check it and try again',
    );
  });

  it('accepts a card through the end of its expiry month', () => {
    expect(validateCard({ ...good, expiry: '10 / 26' }, NOW).expiry).toBeUndefined();
    expect(validateCard({ ...good, expiry: '09 / 26' }, NOW).expiry).toBe('This card has expired');
    expect(validateCard({ ...good, expiry: '10 / 99' }, NOW).expiry).toBe('Check the expiry year');
    expect(validateCard({ ...good, expiry: '1029' }, NOW).expiry).toBe('Enter the expiry date as MM / YY');
  });

  it('wants four CVC digits for American Express and three otherwise', () => {
    expect(validateCard({ ...good, cvc: '12' }, NOW).cvc).toBe('Enter the 3-digit security code');
    const amex = { ...good, number: '3782 822463 10005' };
    expect(validateCard({ ...amex, cvc: '123' }, NOW).cvc).toBe('Enter the 4-digit security code');
    expect(validateCard({ ...amex, cvc: '1234' }, NOW)).toEqual({});
  });
});

describe('saving a card', () => {
  it('keeps only the brand, last four digits, expiry and name', () => {
    const saved = toSavedCard({ ...good, name: '  Ada Lovelace ' });
    expect(saved).toEqual({ brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada Lovelace' });
    expect(JSON.stringify(saved)).not.toContain('4242424242424242');
    expect(JSON.stringify(saved)).not.toContain('123');
    expect(describeCard(saved)).toBe('Visa ending 4242');
    expect(formatCardExpiry(saved)).toBe('04/29');
  });

  it('refuses an invalid card', () => {
    expect(() => toSavedCard({ ...good, number: '9' })).toThrow();
  });
});
