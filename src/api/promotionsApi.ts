import { PROMOTIONS } from '@/data/promotions';
import { dateProblem, normalizeCode, type Promotion } from '@/domain/promotions';
import { ApiError, simulateRequest, type RequestOptions } from './client';

/**
 * Looks up a promo code. Unknown codes fail with NOT_FOUND and codes outside
 * their dates with VALIDATION; whether the bag qualifies is checked by the
 * client, since that changes as the bag does.
 */
export function redeemPromotion(input: string, options?: RequestOptions): Promise<Promotion> {
  return simulateRequest(() => {
    const code = normalizeCode(input);
    const promotion = PROMOTIONS.find((candidate) => candidate.code === code);
    if (!promotion) throw new ApiError('NOT_FOUND', `${code || 'That'} isn't a code we recognise. Check the spelling and try again.`);
    const timing = dateProblem(promotion, new Date());
    if (timing) throw new ApiError('VALIDATION', timing.message);
    return promotion;
  }, options);
}
