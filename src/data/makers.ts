import type { Maker } from '@/domain/stories';

/*
 * The studios behind the catalog. Names match each product's `maker`
 * field; the stories tests check that every maker in the catalog has one.
 * All of them are fictional.
 */

export const MAKERS: Maker[] = [
  {
    slug: 'hollow-kiln',
    name: 'Hollow Kiln',
    craft: 'Stoneware',
    place: 'Asheville, North Carolina',
    founded: 2014,
    art: { tint: 'lilac', motif: 'vessel' },
    intro: 'Two potters, one wood-fired kiln and a glaze recipe book that never stops growing.',
    story: [
      'Hollow Kiln started in a converted tobacco barn with a second-hand wheel and a kiln built from salvaged brick. Mara and Teo still throw every piece themselves, in runs of forty or fifty, and fire them over a long weekend.',
      'Their glazes are mixed from local clays and ash, which is why no two mugs are quite alike. A speckle that lands thick on one rim will barely show on the next.',
    ],
  },
  {
    slug: 'field-and-flax',
    name: 'Field and Flax',
    craft: 'Linen textiles',
    place: 'Portland, Maine',
    founded: 2011,
    art: { tint: 'sage', motif: 'fold' },
    intro: 'European flax, woven and stonewashed into linen that only gets better with use.',
    story: [
      'Field and Flax buys its flax from a cooperative in Normandy and has it woven at a family mill in Lithuania. Everything is cut, sewn and washed in their Portland workshop.',
      'Each piece is stonewashed before it leaves, so the linen arrives soft and has already done its shrinking.',
    ],
  },
  {
    slug: 'lumen-glassworks',
    name: 'Lumen Glassworks',
    craft: 'Blown glass',
    place: 'Corning, New York',
    founded: 2017,
    art: { tint: 'sand', motif: 'bottle' },
    intro: 'Mouth-blown borosilicate glass with a ripple you can feel.',
    story: [
      'Lumen is a three-person hot shop in a town built on glass. Their rippled carafe is blown into an optic mould, then turned by hand so the ribs twist slightly as it cools.',
    ],
  },
  {
    slug: 'grainworks',
    name: 'Grainworks',
    craft: 'Woodwork',
    place: 'Driftless, Wisconsin',
    founded: 2009,
    art: { tint: 'sand', motif: 'stack' },
    intro: 'Boards and bowls from storm-felled oak, finished with oil and beeswax.',
    story: [
      'Grainworks only uses trees that came down on their own: storms, road widening, old age. Each board is air-dried for two years before it is cut, so it stays flat in your kitchen.',
    ],
  },
  {
    slug: 'still-light',
    name: 'Still Light',
    craft: 'Candles',
    place: 'Santa Fe, New Mexico',
    founded: 2016,
    art: { tint: 'blush', motif: 'flame' },
    intro: 'Hand-dipped beeswax tapers that burn clean and slow.',
    story: [
      'Still Light dips its tapers by hand, thirty layers of local beeswax at a time. Natural cotton wicks and no added scent mean the candles smell faintly of honey and nothing else.',
    ],
  },
  {
    slug: 'north-wool',
    name: 'North Wool',
    craft: 'Knitwear and cord',
    place: 'Burlington, Vermont',
    founded: 2012,
    art: { tint: 'lilac', motif: 'garment' },
    intro: 'Merino knits and heavy cord, made to wear for a decade.',
    story: [
      'North Wool knits its sweaters and beanies on vintage machines from fully traceable merino. Their cord trousers are cut from a fourteen-wale cotton cord woven in Italy.',
      'They offer free repairs for the life of every knit; send it back and they will darn it.',
    ],
  },
  {
    slug: 'plainweave',
    name: 'Plainweave',
    craft: 'Organic cotton',
    place: 'Los Angeles, California',
    founded: 2015,
    art: { tint: 'sage', motif: 'garment' },
    intro: 'Everyday cotton basics, cut and sewn ten miles from where they are designed.',
    story: [
      'Plainweave works with organic cotton grown in Texas and a family-run cut-and-sew shop in downtown Los Angeles. Their tees, totes and robes are made to be worn, washed and worn again.',
    ],
  },
  {
    slug: 'mulberry-studio',
    name: 'Mulberry Studio',
    craft: 'Silk accessories',
    place: 'Brooklyn, New York',
    founded: 2019,
    art: { tint: 'blush', motif: 'round' },
    intro: 'Small things in mulberry silk, sewn from the offcuts of bigger ones.',
    story: [
      'Mulberry Studio makes its scrunchies from the silk left over when they cut scarves and pillowcases, so very little of each bolt goes to waste.',
    ],
  },
  {
    slug: 'rosa-apothecary',
    name: 'Rosa Apothecary',
    craft: 'Skin and hair care',
    place: 'Sonoma, California',
    founded: 2013,
    art: { tint: 'blush', motif: 'jar' },
    intro: 'Clays, oils and bars made in small batches from plants grown nearby.',
    story: [
      'Rosa Apothecary is run by a herbalist and a chemist who met at a farmers market. Their formulas are short, their batches are small, and every bar and jar carries its batch date.',
    ],
  },
  {
    slug: 'oat-and-ash',
    name: 'Oat and Ash',
    craft: 'Body care',
    place: 'Bend, Oregon',
    founded: 2018,
    art: { tint: 'sand', motif: 'bar' },
    intro: 'Gentle lotions, mists and balms for skin that does not like a fuss.',
    story: [
      'Oat and Ash began when its founder could not find a lotion her eczema would tolerate. Colloidal oat is in nearly everything they make, and fragrance only ever comes from essential oils.',
    ],
  },
];
