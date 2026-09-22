import type { Promotion } from '@/domain/promotions';

/** The promo codes the shop recognises. Codes are stored normalized: upper case, no spaces. */
export const PROMOTIONS: Promotion[] = [
  {
    code: 'WELCOME10',
    description: '10% off full-price items',
    kind: 'percent',
    value: 10,
    excludeSale: true,
    maxDiscount: 5000,
  },
  {
    code: 'HOME15',
    description: '15% off Home on orders over $50',
    kind: 'percent',
    value: 15,
    departments: ['home'],
    minSubtotal: 5000,
  },
  {
    code: 'TAKE10',
    description: '$10 off orders over $60',
    kind: 'fixed',
    value: 1000,
    minSubtotal: 6000,
  },
  {
    code: 'SHIPFREE',
    description: 'Free standard shipping',
    kind: 'free-shipping',
    value: 0,
  },
  {
    code: 'AUTUMN25',
    description: '25% off the autumn edit',
    kind: 'percent',
    value: 25,
    startsAt: '2026-09-01',
    endsAt: '2026-09-30',
  },
  {
    code: 'HOLIDAY20',
    description: '20% off everything',
    kind: 'percent',
    value: 20,
    startsAt: '2026-11-27',
    endsAt: '2026-12-31',
  },
];
