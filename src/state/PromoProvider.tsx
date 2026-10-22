import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isApiError } from '@/api/client';
import { redeemPromotion } from '@/api/promotionsApi';
import { lookupProduct as lookup } from '@/data/catalogLookup';
import { evaluatePromotion, type PromoEvaluation, type Promotion } from '@/domain/promotions';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import { useCart } from './CartProvider';

export const PROMO_STORAGE_KEY = 'tanelt:promo';

const KINDS = ['percent', 'fixed', 'free-shipping'];

function isPromotion(value: unknown): value is Promotion {
  if (typeof value !== 'object' || value === null) return false;
  const promo = value as Record<string, unknown>;
  return (
    typeof promo.code === 'string' &&
    typeof promo.description === 'string' &&
    typeof promo.kind === 'string' &&
    KINDS.includes(promo.kind) &&
    typeof promo.value === 'number'
  );
}

export type ApplyResult = { ok: true } | { ok: false; message: string };

interface PromoContextValue {
  promotion: Promotion | null;
  /** The applied code checked against the current bag; null with no code. */
  evaluation: PromoEvaluation | null;
  apply: (input: string) => Promise<ApplyResult>;
  remove: () => void;
}

const PromoContext = createContext<PromoContextValue | null>(null);

export function PromoProvider({ children }: { children: ReactNode }) {
  const { lines } = useCart();
  const [promotion, setPromotion] = useState<Promotion | null>(() => readJson(PROMO_STORAGE_KEY, null, isPromotion));

  useEffect(() => {
    if (promotion) writeJson(PROMO_STORAGE_KEY, promotion);
    else removeKey(PROMO_STORAGE_KEY);
  }, [promotion]);

  const evaluation = useMemo(
    () => (promotion ? evaluatePromotion(promotion, lines, lookup, new Date()) : null),
    [promotion, lines],
  );

  const apply = useCallback(
    async (input: string): Promise<ApplyResult> => {
      if (!input.trim()) return { ok: false, message: 'Enter a promo code.' };
      try {
        const found = await redeemPromotion(input);
        // Only keep a code the bag qualifies for right now; a later change to the bag is explained instead.
        const check = evaluatePromotion(found, lines, lookup, new Date());
        if (!check.ok) return { ok: false, message: check.message };
        setPromotion(found);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: isApiError(error) ? error.message : "We couldn't check that code. Try again in a moment.",
        };
      }
    },
    [lines],
  );

  const remove = useCallback(() => setPromotion(null), []);

  const value = useMemo(() => ({ promotion, evaluation, apply, remove }), [promotion, evaluation, apply, remove]);
  return <PromoContext.Provider value={value}>{children}</PromoContext.Provider>;
}

export function usePromo(): PromoContextValue {
  const context = useContext(PromoContext);
  if (!context) throw new Error('usePromo must be used inside <PromoProvider>');
  return context;
}

/** The discount the applied code gives the current bag, or 0. */
export function usePromoDiscount(): number {
  const { evaluation } = usePromo();
  return evaluation?.ok ? evaluation.discount : 0;
}
