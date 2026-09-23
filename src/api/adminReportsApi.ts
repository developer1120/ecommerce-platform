import { CATALOG } from '@/data/catalog';
import { buildSalesReport, type ReportRange, type SalesReport } from '@/domain/salesReport';
import { requireAdmin } from './authApi';
import { simulateRequest, type RequestOptions } from './client';
import { loadOrders } from './mockDb';

/** The overview numbers for the last 7, 30 or 90 days. */
export function getSalesReport(token: string, days: ReportRange, options?: RequestOptions): Promise<SalesReport> {
  return simulateRequest(() => {
    requireAdmin(token);
    return buildSalesReport(loadOrders(), CATALOG, new Date(), days);
  }, options);
}
