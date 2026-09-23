import type { Supplier } from '@/domain/purchasing';

/*
 * How to order from each maker. Names match the catalog's `maker` field.
 * Addresses use the reserved .example domain; nothing is really sent.
 */

export const SUPPLIERS: Supplier[] = [
  { name: 'Hollow Kiln', email: 'orders@hollowkiln.example', leadDays: 15, minUnits: 24 },
  { name: 'Field and Flax', email: 'wholesale@fieldandflax.example', leadDays: 10, minUnits: 20 },
  { name: 'Lumen Glassworks', email: 'studio@lumenglass.example', leadDays: 20, minUnits: 12 },
  { name: 'Grainworks', email: 'hello@grainworks.example', leadDays: 15, minUnits: 10 },
  { name: 'Still Light', email: 'orders@stilllight.example', leadDays: 5, minUnits: 24 },
  { name: 'North Wool', email: 'trade@northwool.example', leadDays: 15, minUnits: 18 },
  { name: 'Plainweave', email: 'wholesale@plainweave.example', leadDays: 7, minUnits: 30 },
  { name: 'Mulberry Studio', email: 'hello@mulberrystudio.example', leadDays: 5, minUnits: 12 },
  { name: 'Rosa Apothecary', email: 'orders@rosaapothecary.example', leadDays: 7, minUnits: 24 },
  { name: 'Oat and Ash', email: 'trade@oatandash.example', leadDays: 7, minUnits: 24 },
];
