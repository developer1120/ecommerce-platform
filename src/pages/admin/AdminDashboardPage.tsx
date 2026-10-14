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
                      {formatMoney(entry.sales)} · {PERCENT.format(entry.share)}
                    </span>
                  </span>
                  <span className={styles.shareTrack} aria-hidden="true">
                    <span className={styles.shareFill} style={{ width: `${Math.max(entry.share * 100, 1)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={adminStyles.panel} aria-labelledby="promos-title">
          <h3 id="promos-title" className={adminStyles.legend}>
            <HeadingIcon icon={TicketPercent} />
            Promo codes
          </h3>
          {report.promos.length === 0 ? (
            <p className={adminStyles.muted}>No promo codes used in this period.</p>
          ) : (
            <table className={styles.compact}>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Discount given</th>
                </tr>
              </thead>
              <tbody>
                {report.promos.map((promo) => (
                  <tr key={promo.code}>
                    <th scope="row" className={adminStyles.code}>
                      {promo.code}
                    </th>
                    <td>{promo.orders}</td>
                    <td>{formatMoney(promo.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={adminStyles.panel} aria-labelledby="stock-title">
          <h3 id="stock-title" className={adminStyles.legend}>
            <HeadingIcon icon={TriangleAlert} />
            Running low
          </h3>
          {report.lowStock.length === 0 ? (
            <p className={adminStyles.muted}>Everything on sale is well stocked.</p>
          ) : (
            <ul className={styles.stockList}>
              {report.lowStock.map((item) => (
                <li key={item.variantId}>
                  <Link to={`/admin/products/${item.productId}`}>
                    {item.name}
                    {item.option && ` (${item.option})`}
                  </Link>
                  <span className={styles.stockCount} data-out={item.stock === 0 || undefined}>
                    {item.stock === 0 ? 'Sold out' : `${item.stock} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

interface StatProps {
  label: string;
  value: string;
  current: number;
  previous: number;
  days: number;
  children?: ReactNode;
}

function Stat({ label, value, current, previous, days, children }: StatProps) {
  const change = percentChange(current, previous);
  const direction = change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down';
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const text =
    change === null
      ? `Nothing in the previous ${days} days`
      : change === 0
        ? `Same as the previous ${days} days`
        : `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)}% on the previous ${days} days`;
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{value}</dd>
      <dd className={styles.change} data-direction={direction}>
        <Icon aria-hidden="true" />
        {text}
      </dd>
      {children && <dd>{children}</dd>}
    </div>
  );
}

/** A bar per day, with the same numbers in a table for anyone who can't see the bars. */
function DailyChart({ daily }: { daily: DayPoint[] }) {
  const max: Cents = Math.max(...daily.map((day) => day.netSales));
  const best = daily.find((day) => day.netSales === max)!;
  const first = daily[0]!;
  const last = daily[daily.length - 1]!;

  return (
    <figure className={styles.chart}>
      <div className={styles.plot} aria-hidden="true">
        <span className={styles.axisMax}>{formatMoney(max, { compact: true })}</span>
        <div className={styles.bars} data-dense={daily.length > 31 || undefined}>
          {daily.map((day) => (
            <span
              key={day.date}
              className={styles.bar}
              data-empty={day.netSales === 0 || undefined}
              style={{ height: `${max > 0 ? Math.max((day.netSales / max) * 100, 2) : 2}%` }}
              title={`${shortDate(day.date)}: ${formatMoney(day.netSales)} from ${plural(day.orders, 'order')}`}
            />
          ))}
        </div>
        <span className={styles.axisDates}>
          <span>{shortDate(first.date)}</span>
          <span>{shortDate(last.date)}</span>
        </span>
      </div>
      <figcaption className={adminStyles.muted}>
        Best day: {shortDate(best.date)}, {formatMoney(best.netSales)} from {plural(best.orders, 'order')}.
      </figcaption>
      <details className={styles.details}>
        <summary>Show the numbers</summary>
        <div className={adminStyles.tableWrap}>
          <table className={styles.compact}>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Orders</th>
                <th scope="col">Net sales</th>
              </tr>
            </thead>
            <tbody>
              {daily
                .filter((day) => day.orders > 0)
                .map((day) => (
                  <tr key={day.date}>
                    <th scope="row">{shortDate(day.date)}</th>
                    <td>{day.orders}</td>
                    <td>{formatMoney(day.netSales)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
