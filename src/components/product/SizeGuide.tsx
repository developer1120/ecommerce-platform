import { useId, useRef, useState, type FormEvent } from 'react';
import { Ruler, Sparkles } from 'lucide-react';
import { PRODUCT_FITS, SIZE_CHARTS } from '@/data/sizeCharts';
import { Button, Sheet, TextField } from '@/components/ui';
import { stockIfChosen, type Product } from '@/domain/product';
import {
  EMPTY_FIT_PROFILE,
  FIT_PREFERENCES,
  FIT_PROFILE_KEY,
  formatRange,
  HOW_TO_MEASURE,
  isFitProfile,
  MEASURE_LABELS,
  parseMeasurement,
  recommendSize,
  type FitProfile,
  type FitResult,
  type Measure,
  type SizeChart,
  type Unit,
} from '@/domain/sizing';
import { readJson, writeJson } from '@/lib/storage';
import { useToast } from '@/state/ToastProvider';
import styles from './SizeGuide.module.css';

const SIZE_OPTION = 'Size';
type Tab = 'chart' | 'finder';

interface SizeGuideProps {
  product: Product;
  selection: Record<string, string>;
  /** Chooses a size on the product page. */
  onPick: (size: string) => void;
}

/** The size chart and fit finder for clothing. Renders nothing for products without one. */
export function SizeGuide({ product, selection, onPick }: SizeGuideProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('chart');
  const fit = PRODUCT_FITS[product.id];
  const sizeOption = product.options.find((option) => option.name === SIZE_OPTION);
  if (!fit || !sizeOption) return null;

  const chart = SIZE_CHARTS[fit.chart];
  const offered = sizeOption.values.map((value) => value.value);
  const show = (next: Tab) => {
    setTab(next);
    setOpen(true);
  };

  return (
    <div className={styles.guide}>
      <p className={styles.fitNote}>{fit.note}</p>
      <div className={styles.links}>
        <button type="button" className={styles.link} onClick={() => show('chart')}>
          <Ruler aria-hidden="true" /> Size guide
        </button>
        <button type="button" className={styles.link} onClick={() => show('finder')}>
          <Sparkles aria-hidden="true" /> Find my size
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Size guide" icon={Ruler}>
        <Tabs tab={tab} onChange={setTab} />
        {tab === 'chart' ? (
          <ChartPanel chart={chart} offered={offered} />
        ) : (
          <FinderPanel
            chart={chart}
            offered={offered}
            soldOut={(size) => stockIfChosen(product, selection, SIZE_OPTION, size) <= 0}
            onPick={(size) => {
              onPick(size);
              setOpen(false);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'chart', label: 'Size chart' },
  { value: 'finder', label: 'Find my size' },
];

/** Two tabs, with arrow keys moving between them as the tabs pattern expects. */
function Tabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ chart: null, finder: null });
  return (
    <div role="tablist" aria-label="Size guide" className={styles.tabs}>
      {TABS.map((option, index) => (
        <button
          key={option.value}
          ref={(node) => {
            refs.current[option.value] = node;
          }}
          type="button"
          role="tab"
          id={`size-tab-${option.value}`}
          aria-selected={tab === option.value}
          aria-controls={`size-panel-${option.value}`}
          tabIndex={tab === option.value ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.value;
            onChange(next);
            refs.current[next]?.focus();
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function UnitSwitch({ unit, onChange }: { unit: Unit; onChange: (unit: Unit) => void }) {
  const name = useId();
  return (
    <fieldset className={styles.units}>
      <legend className="visually-hidden">Units</legend>
      {(['cm', 'in'] as const).map((value) => (
        <label key={value} className={styles.unit}>
          <input type="radio" className="visually-hidden" name={name} checked={unit === value} onChange={() => onChange(value)} />
          <span>{value === 'cm' ? 'Centimetres' : 'Inches'}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ChartPanel({ chart, offered }: { chart: SizeChart; offered: string[] }) {
  const [unit, setUnit] = useState<Unit>(() => loadProfile().unit);
  const rows = chart.rows.filter((row) => offered.includes(row.size));
  return (
    <div role="tabpanel" id="size-panel-chart" aria-labelledby="size-tab-chart" className={styles.panel}>
      <UnitSwitch unit={unit} onChange={setUnit} />
      <table className={styles.table}>
        <caption className={styles.caption}>
          {chart.title}: body measurements in {unit === 'cm' ? 'centimetres' : 'inches'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Size</th>
            {chart.measures.map((measure) => (
              <th key={measure} scope="col">
                {MEASURE_LABELS[measure]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.size}>
              <th scope="row">{row.size}</th>
              {chart.measures.map((measure) => (
                <td key={measure}>{formatRange(row.ranges[measure]!, unit)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className={styles.subTitle}>How to measure</h3>
      <dl className={styles.howTo}>
        {chart.measures.map((measure) => (
          <div key={measure}>
            <dt>{MEASURE_LABELS[measure]}</dt>
            <dd>{HOW_TO_MEASURE[measure]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function loadProfile(): FitProfile {
  return readJson(FIT_PROFILE_KEY, EMPTY_FIT_PROFILE, isFitProfile);
}

interface FinderPanelProps {
  chart: SizeChart;
  offered: string[];
  soldOut: (size: string) => boolean;
  onPick: (size: string) => void;
}

function FinderPanel({ chart, offered, soldOut, onPick }: FinderPanelProps) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<FitProfile>(loadProfile);
  const [errors, setErrors] = useState<Partial<Record<Measure, string>>>({});
  const [result, setResult] = useState<FitResult | null>(null);
  const preferenceName = useId();

  function update(change: Partial<FitProfile>) {
    setProfile((current) => ({ ...current, ...change }));
    setResult(null);
  }

  function find(event: FormEvent) {
    event.preventDefault();
    const found: Partial<Record<Measure, string>> = {};
    const body: Partial<Record<Measure, number>> = {};
    for (const measure of chart.measures) {
      const check = parseMeasurement(profile.values[measure] ?? '', measure, profile.unit);
      if (check.ok) body[measure] = check.cm;
      else found[measure] = check.error;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setResult(null);
      return;
    }
    writeJson(FIT_PROFILE_KEY, profile);
    setResult(recommendSize(chart, body, profile.preference, offered));
  }

  return (
    <div role="tabpanel" id="size-panel-finder" aria-labelledby="size-tab-finder" className={styles.panel}>
      <p className={styles.intro}>Tell us a measurement or two and how you like things to fit. We'll remember them on this device.</p>
      <form className={styles.form} onSubmit={find} noValidate>
        <UnitSwitch unit={profile.unit} onChange={(unit) => update({ unit })} />
        <div className={styles.fields}>
          {chart.measures.map((measure) => (
            <TextField
              key={measure}
              label={`${MEASURE_LABELS[measure]} (${profile.unit})`}
              inputMode="decimal"
              autoComplete="off"
              value={profile.values[measure] ?? ''}
              error={errors[measure]}
              onChange={(event) => {
                update({ values: { ...profile.values, [measure]: event.target.value } });
                if (errors[measure]) setErrors((current) => ({ ...current, [measure]: undefined }));
              }}
            />
          ))}
        </div>
        <fieldset className={styles.preference}>
          <legend className={styles.legend}>I like it to fit</legend>
          <div className={styles.choices}>
            {FIT_PREFERENCES.map((option) => (
              <label key={option.value} className={styles.choice}>
                <input
                  type="radio"
                  className="visually-hidden"
                  name={preferenceName}
                  checked={profile.preference === option.value}
                  onChange={() => update({ preference: option.value })}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" leadingIcon={<Sparkles />}>
          Find my size
        </Button>
      </form>

      <div aria-live="polite">
        {result && (
          <section className={styles.result} aria-label="Your size">
            <p className={styles.resultSize}>
              Your size: <strong>{result.size}</strong>
            </p>
            <p>{explain(result)}</p>
            {soldOut(result.size) && (
              <p className={styles.warning}>{result.size} is sold out right now. Choose it to get an email when it is back.</p>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                onPick(result.size);
                toast({ title: `Size ${result.size} selected` });
              }}
            >
              Choose {result.size}
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}

function explain(result: FitResult): string {
  if (result.outside === 'above') return `Your measurements are above our largest size, so ${result.size} is the closest we make. It may be snug.`;
  if (result.outside === 'below') return `Your measurements are below our smallest size, so ${result.size} is the closest we make. It may be loose.`;
  const parts = [`Your ${MEASURE_LABELS[result.decidedBy].toLowerCase()} points to ${result.measured}.`];
  if (result.between) parts.push('You are between sizes, so we went up one.');
  if (result.size !== result.measured) parts.push(`We moved to ${result.size} for the fit you like.`);
  return parts.join(' ');
}
