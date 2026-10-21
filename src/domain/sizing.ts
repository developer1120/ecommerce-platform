/*
 * Size guides and the fit finder. Charts list the body measurements each
 * size is cut for; the finder takes a shopper's measurements and how they
 * like things to fit, and suggests a size from the ones the product comes in.
 */

export type Measure = 'chest' | 'waist' | 'hip';
export type SizeChartId = 'tops' | 'bottoms' | 'robes';

export interface SizeRow {
  size: string;
  /** Body measurement range in cm, inclusive. */
  ranges: Partial<Record<Measure, [number, number]>>;
}

export interface SizeChart {
  id: SizeChartId;
  title: string;
  measures: Measure[];
  rows: SizeRow[];
}

export interface ProductFit {
  chart: SizeChartId;
  fit: 'relaxed' | 'regular';
  note: string;
}

export const MEASURE_LABELS: Record<Measure, string> = { chest: 'Chest', waist: 'Waist', hip: 'Hip' };

export const HOW_TO_MEASURE: Record<Measure, string> = {
  chest: 'Around the fullest part of your chest, under your arms, with the tape level.',
  waist: 'Around your natural waist, the narrowest part, without pulling the tape tight.',
  hip: 'Around the fullest part of your hips, feet together.',
};

/** What a person could plausibly measure, in cm. Anything outside is probably a typo or the wrong unit. */
const LIMITS: Record<Measure, [number, number]> = { chest: [60, 160], waist: [50, 150], hip: [70, 170] };

export type Unit = 'cm' | 'in';
export const CM_PER_INCH = 2.54;

export function toCm(value: number, unit: Unit): number {
  return unit === 'cm' ? value : value * CM_PER_INCH;
}

/** "94 cm" or "37 in", rounded to what a tape measure shows. */
export function formatMeasure(cm: number, unit: Unit): string {
  if (unit === 'cm') return `${Math.round(cm)}`;
  return `${Math.round((cm / CM_PER_INCH) * 2) / 2}`;
}

export function formatRange([min, max]: [number, number], unit: Unit): string {
  return `${formatMeasure(min, unit)}–${formatMeasure(max, unit)}`;
}

export type MeasurementCheck = { ok: true; cm: number } | { ok: false; error: string };

/** Reads a typed measurement, in either unit, and checks it's a believable body size. */
export function parseMeasurement(input: string, measure: Measure, unit: Unit): MeasurementCheck {
  const text = input.trim().replace(',', '.');
  const label = MEASURE_LABELS[measure].toLowerCase();
  if (!text) return { ok: false, error: `Enter your ${label} measurement` };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: 'Use a number, like 92 or 36.5' };
  const cm = toCm(Number(text), unit);
  const [min, max] = LIMITS[measure];
  if (cm < min || cm > max) {
    return { ok: false, error: `That looks off. Most ${label} measurements are ${formatRange([min, max], unit)} ${unit}` };
  }
  return { ok: true, cm };
}

export type FitPreference = 'closer' | 'true' | 'roomier';

export const FIT_PREFERENCES: { value: FitPreference; label: string }[] = [
  { value: 'closer', label: 'Closer' },
  { value: 'true', label: 'As designed' },
  { value: 'roomier', label: 'Roomier' },
];

export interface FitResult {
  size: string;
  /** The size the measurements alone point to, before the preference. */
  measured: string;
  /** A measurement fell between two sizes, so the larger was taken. */
  between: boolean;
  /** Measurements beyond the chart: the nearest size may not fit well. */
  outside?: 'below' | 'above';
  /** The measure that decided the size, when there were several. */
  decidedBy: Measure;
}

/**
 * Suggests a size. Each measurement points to the smallest size that fits
 * it; the largest of those wins, so nothing is tight. Then the preference
 * moves one size down or up, within the sizes the product comes in.
 */
export function recommendSize(
  chart: SizeChart,
  body: Partial<Record<Measure, number>>,
  preference: FitPreference,
  offered: string[],
): FitResult | null {
  const rows = chart.rows.filter((row) => offered.includes(row.size));
  const measures = chart.measures.filter((measure) => body[measure] !== undefined);
  if (rows.length === 0 || measures.length === 0) return null;

  let index = -1;
  let decidedBy = measures[0]!;
  let between = false;
  let outside: FitResult['outside'];
  for (const measure of measures) {
    const value = body[measure]!;
    const fits = rows.findIndex((row) => value <= (row.ranges[measure]?.[1] ?? Infinity));
    let found = fits;
    if (fits < 0) {
      found = rows.length - 1;
      outside = 'above';
    } else if (value < rows[0]!.ranges[measure]![0]) {
      outside ??= 'below';
    } else if (value < rows[fits]!.ranges[measure]![0]) {
      between = true;
    }
    if (found > index) {
      index = found;
      decidedBy = measure;
    }
  }
  const measured = rows[index]!.size;
  const shift = preference === 'closer' ? -1 : preference === 'roomier' ? 1 : 0;
  const final = Math.min(rows.length - 1, Math.max(0, index + shift));
  return { size: rows[final]!.size, measured, between, decidedBy, ...(outside && { outside }) };
}

/** A shopper's measurements, kept on this device so the finder remembers them. */
export interface FitProfile {
  unit: Unit;
  /** As typed, in the profile's unit. */
  values: Partial<Record<Measure, string>>;
  preference: FitPreference;
}

export const FIT_PROFILE_KEY = 'tanelt:fit-profile';
export const EMPTY_FIT_PROFILE: FitProfile = { unit: 'cm', values: {}, preference: 'true' };

export function isFitProfile(value: unknown): value is FitProfile {
  if (typeof value !== 'object' || value === null) return false;
  const profile = value as Partial<FitProfile>;
  return (
    (profile.unit === 'cm' || profile.unit === 'in') &&
    typeof profile.values === 'object' &&
    profile.values !== null &&
    FIT_PREFERENCES.some((option) => option.value === profile.preference)
  );
}
