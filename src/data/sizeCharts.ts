import type { ProductFit, SizeChart, SizeChartId } from '@/domain/sizing';

/*
 * Body measurements, in centimetres, that each size is cut for. Measure
 * the body, not a garment: the cut adds its own room on top.
 */

export const SIZE_CHARTS: Record<SizeChartId, SizeChart> = {
  tops: {
    id: 'tops',
    title: 'Tops and knitwear',
    measures: ['chest'],
    rows: [
      { size: 'XS', ranges: { chest: [82, 87] } },
      { size: 'S', ranges: { chest: [88, 94] } },
      { size: 'M', ranges: { chest: [95, 101] } },
      { size: 'L', ranges: { chest: [102, 109] } },
      { size: 'XL', ranges: { chest: [110, 117] } },
    ],
  },
  bottoms: {
    id: 'bottoms',
    title: 'Trousers',
    measures: ['waist', 'hip'],
    rows: [
      { size: '26', ranges: { waist: [64, 68], hip: [86, 90] } },
      { size: '28', ranges: { waist: [69, 73], hip: [91, 95] } },
      { size: '30', ranges: { waist: [74, 78], hip: [96, 100] } },
      { size: '32', ranges: { waist: [79, 83], hip: [101, 105] } },
      { size: '34', ranges: { waist: [84, 88], hip: [106, 110] } },
    ],
  },
  robes: {
    id: 'robes',
    title: 'Robes',
    measures: ['chest'],
    rows: [
      { size: 'S/M', ranges: { chest: [82, 101] } },
      { size: 'L/XL', ranges: { chest: [102, 117] } },
    ],
  },
};

/** Which chart each sized product uses, and how it's cut. */
export const PRODUCT_FITS: Record<string, ProductFit> = {
  'ff-shirt': { chart: 'tops', fit: 'relaxed', note: 'Relaxed fit with a dropped shoulder. Between sizes, or like it closer? Size down.' },
  'nw-crew': { chart: 'tops', fit: 'regular', note: 'Regular fit. Merino relaxes a little with wear.' },
  'pl-tee': { chart: 'tops', fit: 'relaxed', note: 'Relaxed fit. Size down for a closer tee.' },
  'nw-cord': { chart: 'bottoms', fit: 'regular', note: 'Sized by waist in inches. Fitted at the waist, wide through the leg.' },
  'pl-robe': { chart: 'robes', fit: 'relaxed', note: 'Cut generously to wrap closed. Two sizes cover XS to XL.' },
};
