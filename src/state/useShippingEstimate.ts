import { useEffect, useState } from 'react';
import { findState } from '@/data/usStates';
import { findShippingMethod, SHIPPING_METHODS, type ShippingMethodId } from '@/domain/shipping';
import { readJson, writeJson } from '@/lib/storage';

export const ESTIMATE_STORAGE_KEY = 'tanelt:estimate';

interface StoredEstimate {
  state: string | null;
  method: ShippingMethodId;
}

function isStoredEstimate(value: unknown): value is StoredEstimate {
  if (typeof value !== 'object' || value === null) return false;
  const estimate = value as Record<string, unknown>;
  return (
    (estimate.state === null || typeof estimate.state === 'string') &&
    typeof estimate.method === 'string' &&
    findShippingMethod(estimate.method) !== undefined
  );
}

const DEFAULT: StoredEstimate = { state: null, method: 'standard' };

/** The saved estimate, read once, e.g. to start checkout from it. */
export function readEstimate(): StoredEstimate {
  return readJson(ESTIMATE_STORAGE_KEY, DEFAULT, isStoredEstimate);
}

/**
 * Where the shopper expects to ship and how fast, remembered between visits
 * so the bag estimate and checkout start from the same choice.
 */
export function useShippingEstimate() {
  const [estimate, setEstimate] = useState<StoredEstimate>(readEstimate);

  useEffect(() => {
    writeJson(ESTIMATE_STORAGE_KEY, estimate);
  }, [estimate]);

  const destination = findState(estimate.state);
  // Next day doesn't reach Alaska or Hawaii; fall back to standard rather than quote the impossible.
  let method = findShippingMethod(estimate.method) ?? SHIPPING_METHODS[0]!;
  if (destination?.remote && !method.remoteOk) method = SHIPPING_METHODS[0]!;

  return {
    destination,
    method,
    setState: (state: string | null) => setEstimate((current) => ({ ...current, state: state || null })),
    setMethod: (id: ShippingMethodId) => setEstimate((current) => ({ ...current, method: id })),
  };
}
