import type { ProductLookup } from '@/domain/promotions';
import { CATALOG } from './catalog';

/**
 * Finds a catalog product by id, for rules that need more than a bag line
 * remembers (such as its department). It reads the live catalog each time,
 * so products the admin adds or edits are found too.
 */
export const lookupProduct: ProductLookup = (productId) => CATALOG.find((product) => product.id === productId);
