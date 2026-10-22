import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ADDRESS_FIELDS, EMPTY_ADDRESS, normalizeAddress, type ShippingAddress } from '@/domain/address';
import { BRAND_NAMES, type SavedCard } from '@/domain/payment';
import { findShippingMethod, type ShippingMethodId } from '@/domain/shipping';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import { readEstimate } from './useShippingEstimate';

export const CHECKOUT_STORAGE_KEY = 'tanelt:checkout';

export interface CheckoutDraft {
  address: ShippingAddress;
  /** Set once the shopper has continued past the address step. */
  addressConfirmed: boolean;
  methodId: ShippingMethodId;
  /** Set once the shopper has continued past the delivery step. */
  deliveryConfirmed: boolean;
  /** The safe parts of the card; never the full number or CVC. */
  card: SavedCard | null;
}

function isAddress(value: unknown): value is ShippingAddress {
  return (
    typeof value === 'object' &&
    value !== null &&
    ADDRESS_FIELDS.every((field) => typeof (value as Record<string, unknown>)[field] === 'string')
  );
}

function isSavedCard(value: unknown): value is SavedCard {
  if (typeof value !== 'object' || value === null) return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.brand === 'string' &&
    card.brand in BRAND_NAMES &&
    typeof card.last4 === 'string' &&
    /^\d{4}$/.test(card.last4) &&
    Number.isInteger(card.expMonth) &&
    Number.isInteger(card.expYear) &&
    typeof card.name === 'string'
  );
}

function isDraft(value: unknown): value is CheckoutDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    isAddress(draft.address) &&
    typeof draft.addressConfirmed === 'boolean' &&
    typeof draft.methodId === 'string' &&
    findShippingMethod(draft.methodId) !== undefined &&
    typeof draft.deliveryConfirmed === 'boolean' &&
    (draft.card === null || isSavedCard(draft.card))
  );
}

/** A fresh checkout starts from the bag page's estimate: its state and delivery choice. */
function initialDraft(): CheckoutDraft {
  const estimate = readEstimate();
  return {
    address: { ...EMPTY_ADDRESS, state: estimate.state ?? '' },
    addressConfirmed: false,
    methodId: estimate.method,
    deliveryConfirmed: false,
    card: null,
  };
}

interface CheckoutContextValue {
  draft: CheckoutDraft;
  saveAddress: (address: ShippingAddress) => void;
  setMethod: (id: ShippingMethodId) => void;
  confirmDelivery: () => void;
  saveCard: (card: SavedCard) => void;
  /** Forgets everything, e.g. once an order is placed. */
  reset: () => void;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

/**
 * What the shopper has entered so far. Kept in sessionStorage: a refresh
 * keeps it, closing the tab forgets it, and it never outlives the visit.
 */
export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<CheckoutDraft>(() =>
    readJson(CHECKOUT_STORAGE_KEY, initialDraft(), isDraft, 'session'),
  );

  useEffect(() => {
    writeJson(CHECKOUT_STORAGE_KEY, draft, 'session');
  }, [draft]);

  const saveAddress = useCallback((address: ShippingAddress) => {
    setDraft((current) => ({ ...current, address: normalizeAddress(address), addressConfirmed: true }));
  }, []);

  const setMethod = useCallback((methodId: ShippingMethodId) => {
    setDraft((current) => ({ ...current, methodId }));
  }, []);

  const confirmDelivery = useCallback(() => {
    setDraft((current) => ({ ...current, deliveryConfirmed: true }));
  }, []);

  const saveCard = useCallback((card: SavedCard) => {
    setDraft((current) => ({ ...current, card }));
  }, []);

  const reset = useCallback(() => {
    removeKey(CHECKOUT_STORAGE_KEY, 'session');
    setDraft(initialDraft());
  }, []);

  const value = useMemo(
    () => ({ draft, saveAddress, setMethod, confirmDelivery, saveCard, reset }),
    [draft, saveAddress, setMethod, confirmDelivery, saveCard, reset],
  );
  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckout(): CheckoutContextValue {
  const context = useContext(CheckoutContext);
  if (!context) throw new Error('useCheckout must be used inside <CheckoutProvider>');
  return context;
}
