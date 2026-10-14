import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, CalendarDays, ChartColumn, ChartPie, Minus, TicketPercent, TrendingDown, TrendingUp, TriangleAlert, Trophy } from 'lucide-react';
import { getSalesReport } from '@/api/adminReportsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { HeadingIcon, Spinner, ToggleChip } from '@/components/ui';
import { formatMoney, type Cents } from '@/domain/money';
import {
  DEFAULT_RANGE,
  isReportRange,
  percentChange,
  REPORT_RANGES,
  type DayPoint,
  type ReportRange,
  type SalesReport,
} from '@/domain/salesReport';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/state/AuthProvider';
import adminStyles from './Admin.module.css';
import styles from './Dashboard.module.css';

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const shortDate = (isoDay: string) => SHORT_DATE.format(new Date(`${isoDay}T00:00:00Z`));
const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function AdminDashboardPage() {
  usePageTitle('Overview · Admin');
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get('range'));
  const days: ReportRange = isReportRange(requested) ? requested : DEFAULT_RANGE;
  const report = useAsync((signal) => getSalesReport(token!, days, { signal }), [token, days]);

  return (
    <section className={adminStyles.section} aria-labelledby="overview-title">
      <div className={adminStyles.toolbar}>
        <h2 id="overview-title" className={adminStyles.sectionTitle}>
          <HeadingIcon icon={ChartColumn} />
          Overview
        </h2>
        <div className={adminStyles.chips} role="group" aria-label="Period">
          {REPORT_RANGES.map((range) => (
            <ToggleChip
              key={range}
              selected={days === range}
              onToggle={() => setParams(range === DEFAULT_RANGE ? {} : { range: String(range) }, { replace: true })}
            >
              {range} days
            </ToggleChip>
          ))}
        </div>
      </div>
      {report.status === 'error' ? (
        <LoadError error={report.error} onRetry={report.reload} subject="the overview" />
      ) : report.data?.days !== days ? (
        <Spinner label="Working out the numbers" />
      ) : (
        <Report report={report.data} />
      )}
    </section>
  );
}

function Report({ report }: { report: SalesReport }) {
  const { current, previous, days } = report;
  const empty = current.orders === 0;

  return (
    <>
      {(report.toPack > 0 || report.toShip > 0) && (
        <div className={styles.todo}>
          {report.toPack > 0 && (
            <Link to="/admin/orders?status=placed" className={styles.todoLink}>
              {plural(report.toPack, 'order')} to pack <ArrowRight aria-hidden="true" />
            </Link>
          )}
          {report.toShip > 0 && (
            <Link to="/admin/orders?status=packed" className={styles.todoLink}>
              {plural(report.toShip, 'order')} to ship <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      <dl className={styles.stats}>
        <Stat label="Net sales" value={formatMoney(current.netSales)} current={current.netSales} previous={previous.netSales} days={days} />
        <Stat label="Orders" value={String(current.orders)} current={current.orders} previous={previous.orders} days={days}>
          {report.cancelled > 0 && <span className={styles.aside}>{report.cancelled} cancelled, not counted</span>}
        </Stat>
        <Stat
          label="Average order"
          value={formatMoney(current.averageOrder)}
          current={current.averageOrder}
          previous={previous.averageOrder}
          days={days}
        />
        <Stat label="Items sold" value={String(current.items)} current={current.items} previous={previous.items} days={days} />
      </dl>
      <p className={adminStyles.muted}>Net sales are merchandise after discounts, without tax or shipping.</p>

      <section className={adminStyles.panel} aria-labelledby="daily-title">
        <h3 id="daily-title" className={adminStyles.legend}>
          <HeadingIcon icon={CalendarDays} />
          Net sales by day
        </h3>
        {empty ? (
          <p className={adminStyles.muted}>No sales in the last {days} days yet.</p>
        ) : (
          <DailyChart daily={report.daily} />
        )}
      </section>

      <div className={styles.columns}>
        <section className={adminStyles.panel} aria-labelledby="top-title">
          <h3 id="top-title" className={adminStyles.legend}>
            <HeadingIcon icon={Trophy} />
            Best sellers
          </h3>
          {report.topProducts.length === 0 ? (
            <p className={adminStyles.muted}>Nothing sold in this period.</p>
          ) : (
            <table className={styles.compact}>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Units</th>
                  <th scope="col">Sales</th>
                </tr>
              </thead>
              <tbody>
                {report.topProducts.map((product) => (
                  <tr key={product.productId}>
                    <th scope="row">
                      <Link to={`/admin/products/${product.productId}`}>{product.name}</Link>
                    </th>
                    <td>{product.units}</td>
                    <td>{formatMoney(product.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={adminStyles.panel} aria-labelledby="departments-title">
          <h3 id="departments-title" className={adminStyles.legend}>
            <HeadingIcon icon={ChartPie} />
            By department
          </h3>
          {report.departments.length === 0 ? (
            <p className={adminStyles.muted}>Nothing sold in this period.</p>
          ) : (
            <ul className={styles.shares}>
              {report.departments.map((entry) => (
                <li key={entry.department}>
                  <span className={styles.shareLabel}>
                    <span>{capitalize(entry.department)}</span>
                    <span>
