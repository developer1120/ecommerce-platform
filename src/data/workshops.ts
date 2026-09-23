import type { Workshop, WorkshopSession } from '@/domain/workshops';

/*
 * Workshops in the studio and their first sessions. The studio adds and
 * cancels sessions from the admin; these are the ones the shop opens with.
 * Times are UTC: 23:30Z is 6:30 PM and 15:00Z is 10 AM in Brooklyn in winter.
 */

export const WORKSHOPS: Workshop[] = [
  {
    slug: 'wheel-throwing-for-beginners',
    title: 'Wheel throwing for beginners',
    maker: 'hollow-kiln',
    summary: 'Centre clay, pull a wall and throw your first cups with Mara from Hollow Kiln.',
    description: [
      "No experience needed. Mara starts with wedging and centring, then shows you how to open and pull up a cylinder. By the end of the evening you'll have thrown two or three small cups.",
      'We trim, glaze and fire your best piece and post it to you about four weeks later.',
    ],
    includes: ['Clay, tools and an apron', 'One piece glazed, fired and posted to you', 'Tea and something sweet'],
    durationMinutes: 150,
    price: 9500,
    capacity: 8,
    art: { tint: 'lilac', motif: 'vessel' },
  },
  {
    slug: 'hand-dipped-candles',
    title: 'Hand-dipped beeswax candles',
    maker: 'still-light',
    summary: 'Dip a pair of tapers layer by layer in warm local beeswax.',
    description: [
      'Still Light bring their dipping pots to the studio for a slow, quiet evening. You will dip a pair of tapers thirty times over and learn why beeswax burns cleaner and longer than paraffin.',
    ],
    includes: ['All the wax and wicks', 'Two tapers to take home', 'A candle care card'],
    durationMinutes: 90,
    price: 5500,
    capacity: 10,
    art: { tint: 'blush', motif: 'flame' },
  },
  {
    slug: 'visible-mending',
    title: 'Visible mending',
    maker: 'north-wool',
    summary: 'Darn, patch and Swiss-darn your favourite knits with North Wool.',
    description: [
      "Bring a jumper with a hole in it. North Wool's repair team teach darning on a mushroom, Swiss darning over thin patches, and how to make a repair you're proud to show off.",
    ],
    includes: ['Darning mushroom and needles to keep', 'A selection of merino mending yarn', 'Hot drinks'],
    durationMinutes: 120,
    price: 6500,
    capacity: 8,
    art: { tint: 'sage', motif: 'garment' },
  },
  {
    slug: 'linen-napkin-printing',
    title: 'Block printing on linen',
    maker: 'field-and-flax',
    summary: 'Carve a block and print a set of four linen napkins.',
    description: [
      'Field and Flax provide stonewashed linen napkins, carving blocks and water-based inks. You will carve a simple motif, practise on paper, then print a set of four to take home.',
    ],
    includes: ['Four linen napkins', 'A carving block and tool to keep', 'Inks and aprons'],
    durationMinutes: 180,
    price: 8500,
    capacity: 6,
    art: { tint: 'sand', motif: 'fold' },
  },
];

export const SEED_SESSIONS: WorkshopSession[] = [
  { id: 'ws-throw-1112', workshop: 'wheel-throwing-for-beginners', startsAt: '2026-11-12T23:30:00Z', status: 'scheduled' },
  { id: 'ws-throw-1205', workshop: 'wheel-throwing-for-beginners', startsAt: '2026-12-05T15:00:00Z', status: 'scheduled' },
  { id: 'ws-throw-0114', workshop: 'wheel-throwing-for-beginners', startsAt: '2027-01-14T23:30:00Z', status: 'scheduled' },
  { id: 'ws-candle-1119', workshop: 'hand-dipped-candles', startsAt: '2026-11-19T23:30:00Z', status: 'scheduled' },
  { id: 'ws-candle-1210', workshop: 'hand-dipped-candles', startsAt: '2026-12-10T23:30:00Z', status: 'scheduled' },
  { id: 'ws-mend-1121', workshop: 'visible-mending', startsAt: '2026-11-21T15:00:00Z', status: 'scheduled' },
  { id: 'ws-mend-0116', workshop: 'visible-mending', startsAt: '2027-01-16T15:00:00Z', status: 'scheduled' },
  { id: 'ws-print-1128', workshop: 'linen-napkin-printing', startsAt: '2026-11-28T15:00:00Z', status: 'scheduled' },
  { id: 'ws-print-0123', workshop: 'linen-napkin-printing', startsAt: '2027-01-23T15:00:00Z', status: 'scheduled' },
];
