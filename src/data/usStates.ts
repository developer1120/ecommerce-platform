import type { Department } from '@/domain/product';

export interface UsState {
  code: string;
  name: string;
  /** State-level sales tax in thousandths of a percent: 6875 = 6.875%. Local taxes are not included. */
  taxRate: number;
  /** Departments this state does not tax, e.g. clothing. */
  exempt?: Department[];
  /** Whether shipping charges are taxed. */
  taxesShipping?: boolean;
  /** Alaska and Hawaii cost more to reach and can't get next-day delivery. */
  remote?: boolean;
}

/**
 * A simplified sales tax table: state base rates only, with clothing
 * exemptions and shipping taxability for a handful of states. Good enough
 * for estimates in a demo shop, not for filing returns.
 */
export const US_STATES: UsState[] = [
  { code: 'AL', name: 'Alabama', taxRate: 4000 },
  { code: 'AK', name: 'Alaska', taxRate: 0, remote: true },
  { code: 'AZ', name: 'Arizona', taxRate: 5600 },
  { code: 'AR', name: 'Arkansas', taxRate: 6500, taxesShipping: true },
  { code: 'CA', name: 'California', taxRate: 7250 },
  { code: 'CO', name: 'Colorado', taxRate: 2900 },
  { code: 'CT', name: 'Connecticut', taxRate: 6350, taxesShipping: true },
  { code: 'DE', name: 'Delaware', taxRate: 0 },
  { code: 'DC', name: 'District of Columbia', taxRate: 6000 },
  { code: 'FL', name: 'Florida', taxRate: 6000 },
  { code: 'GA', name: 'Georgia', taxRate: 4000, taxesShipping: true },
  { code: 'HI', name: 'Hawaii', taxRate: 4000, taxesShipping: true, remote: true },
  { code: 'ID', name: 'Idaho', taxRate: 6000 },
  { code: 'IL', name: 'Illinois', taxRate: 6250 },
  { code: 'IN', name: 'Indiana', taxRate: 7000, taxesShipping: true },
  { code: 'IA', name: 'Iowa', taxRate: 6000 },
  { code: 'KS', name: 'Kansas', taxRate: 6500, taxesShipping: true },
  { code: 'KY', name: 'Kentucky', taxRate: 6000, taxesShipping: true },
  { code: 'LA', name: 'Louisiana', taxRate: 4450 },
  { code: 'ME', name: 'Maine', taxRate: 5500 },
  { code: 'MD', name: 'Maryland', taxRate: 6000 },
  { code: 'MA', name: 'Massachusetts', taxRate: 6250 },
  { code: 'MI', name: 'Michigan', taxRate: 6000, taxesShipping: true },
  { code: 'MN', name: 'Minnesota', taxRate: 6875, exempt: ['apparel'], taxesShipping: true },
  { code: 'MS', name: 'Mississippi', taxRate: 7000, taxesShipping: true },
  { code: 'MO', name: 'Missouri', taxRate: 4225 },
  { code: 'MT', name: 'Montana', taxRate: 0 },
  { code: 'NE', name: 'Nebraska', taxRate: 5500, taxesShipping: true },
  { code: 'NV', name: 'Nevada', taxRate: 6850 },
  { code: 'NH', name: 'New Hampshire', taxRate: 0 },
  { code: 'NJ', name: 'New Jersey', taxRate: 6625, exempt: ['apparel'], taxesShipping: true },
  { code: 'NM', name: 'New Mexico', taxRate: 4875, taxesShipping: true },
  { code: 'NY', name: 'New York', taxRate: 4000, taxesShipping: true },
  { code: 'NC', name: 'North Carolina', taxRate: 4750, taxesShipping: true },
  { code: 'ND', name: 'North Dakota', taxRate: 5000, taxesShipping: true },
  { code: 'OH', name: 'Ohio', taxRate: 5750, taxesShipping: true },
  { code: 'OK', name: 'Oklahoma', taxRate: 4500 },
  { code: 'OR', name: 'Oregon', taxRate: 0 },
  { code: 'PA', name: 'Pennsylvania', taxRate: 6000, exempt: ['apparel'], taxesShipping: true },
  { code: 'RI', name: 'Rhode Island', taxRate: 7000, taxesShipping: true },
  { code: 'SC', name: 'South Carolina', taxRate: 6000, taxesShipping: true },
  { code: 'SD', name: 'South Dakota', taxRate: 4200, taxesShipping: true },
  { code: 'TN', name: 'Tennessee', taxRate: 7000, taxesShipping: true },
  { code: 'TX', name: 'Texas', taxRate: 6250, taxesShipping: true },
  { code: 'UT', name: 'Utah', taxRate: 6100 },
  { code: 'VT', name: 'Vermont', taxRate: 6000, exempt: ['apparel'], taxesShipping: true },
  { code: 'VA', name: 'Virginia', taxRate: 5300 },
  { code: 'WA', name: 'Washington', taxRate: 6500, taxesShipping: true },
  { code: 'WV', name: 'West Virginia', taxRate: 6000, taxesShipping: true },
  { code: 'WI', name: 'Wisconsin', taxRate: 5000, taxesShipping: true },
  { code: 'WY', name: 'Wyoming', taxRate: 4000 },
];

export function findState(code: string | null | undefined): UsState | undefined {
  return code ? US_STATES.find((state) => state.code === code.toUpperCase()) : undefined;
}
