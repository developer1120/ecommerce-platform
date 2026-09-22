import type { JournalArticle } from '@/domain/stories';

/*
 * The studio's journal: maker visits, care guides and the odd recipe.
 * Product blocks list product ids; products that are no longer on sale
 * are left out when the article is shown.
 */

export const JOURNAL: JournalArticle[] = [
  {
    slug: 'a-weekend-at-the-kiln',
    title: 'A weekend at the kiln',
    dek: 'We spent three days with Hollow Kiln as they fired the autumn batch of mugs.',
    author: 'Noor Haddad',
    publishedAt: '2026-09-28',
    tags: ['makers', 'ceramics'],
    maker: 'hollow-kiln',
    art: { tint: 'lilac', motif: 'cup' },
    body: [
      { type: 'p', text: 'The kiln at Hollow Kiln is lit before dawn on a Friday and is not allowed to go out until Sunday night. For those sixty hours, Mara and Teo take turns feeding it split oak every few minutes, sleeping in shifts on a cot beside the firebox.' },
      { type: 'h', text: 'Fire does the glazing' },
      { type: 'p', text: 'Much of the colour on a wood-fired pot comes from the fire itself. Ash rises with the flame, lands on the shoulders of the pots and melts into glaze. Pieces near the firebox come out darker and glossier; those at the back stay pale and dry.' },
      { type: 'quote', text: 'We decide where every pot sits. After that, the kiln decides what it looks like.', cite: 'Mara, Hollow Kiln' },
      { type: 'p', text: 'That is why the speckle on our mugs varies from piece to piece. We have stopped thinking of it as variation and started thinking of it as a record of where each mug sat in the fire.' },
      { type: 'products', ids: ['hk-mug', 'hk-vase', 'hk-incense'], caption: 'From this firing' },
    ],
  },
  {
    slug: 'how-to-wash-linen',
    title: 'How to wash linen (and why it gets better)',
    dek: 'A short guide to keeping linen soft, from the people who stonewash it for a living.',
    author: 'The Tanelt studio',
    publishedAt: '2026-09-12',
    tags: ['care', 'linen'],
    maker: 'field-and-flax',
    art: { tint: 'sage', motif: 'fold' },
    body: [
      { type: 'p', text: 'Linen is one of the few fabrics that improves with washing. Each cycle relaxes the fibres a little more, which is why an old linen shirt feels nothing like a new one.' },
      { type: 'h', text: 'The basics' },
      {
        type: 'list',
        items: [
          'Wash at 30–40 °C with a mild liquid detergent.',
          'Skip bleach and fabric softener; both weaken the fibres.',
          'Tumble dry low, or line dry and shake it out while damp.',
          'Iron while slightly damp, or not at all. Creases are part of the look.',
        ],
      },
      { type: 'h', text: 'Will it shrink?' },
      { type: 'p', text: 'Everything from Field and Flax is stonewashed before it ships, so it has already done most of its shrinking. Keep washes cool and you will not see more than a percent or two.' },
      { type: 'products', ids: ['ff-throw', 'ff-napkin', 'ff-shirt'], caption: 'Linen in the shop' },
    ],
  },
  {
    slug: 'setting-an-autumn-table',
    title: 'Setting an autumn table',
    dek: 'Five things we reach for when friends come over and the evenings draw in.',
    author: 'Iris Moreau',
    publishedAt: '2026-10-02',
    tags: ['home', 'entertaining'],
    art: { tint: 'sand', motif: 'flame' },
    body: [
      { type: 'p', text: 'An autumn table should feel gathered rather than styled. We start with linen, add a little height with candles, and leave space for the food to be the centre of it all.' },
      { type: 'h', text: 'Start with the cloth' },
      { type: 'p', text: 'Washed linen napkins in two colours, folded loosely rather than pressed, set the tone. Mismatched is fine; it looks like you have been doing this for years.' },
      { type: 'h', text: 'Then light' },
      { type: 'p', text: 'Beeswax tapers at different heights give the table rhythm. Keep them below eye level so nobody has to talk around a flame.' },
      { type: 'quote', text: 'If the board is beautiful, the cheese can be from the corner shop.', cite: 'Iris Moreau' },
      { type: 'products', ids: ['ff-napkin', 'sl-taper', 'gw-board', 'lg-carafe'], caption: 'On our table' },
    ],
  },
  {
    slug: 'a-repair-for-life',
    title: 'A repair for life',
    dek: 'Why North Wool will darn your sweater for free, forever.',
    author: 'Noor Haddad',
    publishedAt: '2026-08-21',
    tags: ['makers', 'apparel'],
    maker: 'north-wool',
    art: { tint: 'lilac', motif: 'garment' },
    body: [
      { type: 'p', text: 'Every North Wool knit comes with a small card: if it ever needs mending, send it back. They have repaired elbows, cuffs and one sweater a dog had clearly loved very much.' },
      { type: 'p', text: 'The promise costs them less than you might think. Good merino rarely fails, and when it does, a darn takes an experienced knitter under an hour.' },
      { type: 'quote', text: 'A sweater you keep for ten years is the most sustainable sweater there is.', cite: 'North Wool' },
      { type: 'products', ids: ['nw-crew', 'nw-beanie'], caption: 'Built to be mended' },
    ],
  },
  {
    slug: 'a-short-guide-to-face-oils',
    title: 'A short guide to face oils',
    dek: 'Which oil, when, and how much: answers from Rosa Apothecary.',
    author: 'The Tanelt studio',
    publishedAt: '2026-07-30',
    tags: ['beauty', 'care'],
    maker: 'rosa-apothecary',
    art: { tint: 'blush', motif: 'bottle' },
    body: [
      { type: 'p', text: 'Face oils have a reputation for being heavy. Most people simply use too much. Two or three drops, pressed into damp skin after cleansing, is plenty.' },
      { type: 'h', text: 'Morning or night?' },
      { type: 'p', text: 'Either. In the morning, let it sink in for a minute before sunscreen. At night, it can go over a serum or straight onto skin.' },
      {
        type: 'list',
        items: ['Dry skin: use it twice a day.', 'Oily skin: once, at night, and just two drops.', 'Sensitive skin: patch test on your inner arm first.'],
      },
      { type: 'products', ids: ['ra-oil', 'ra-mask', 'oa-balm'], caption: 'Mentioned here' },
    ],
  },
  {
    slug: 'the-slow-morning',
    title: 'The slow morning',
    dek: 'Ten minutes, a good mug and no phone: notes on starting the day gently.',
    author: 'Iris Moreau',
    publishedAt: '2026-06-18',
    tags: ['home', 'rituals'],
    art: { tint: 'sage', motif: 'cup' },
    body: [
      { type: 'p', text: 'We asked everyone in the studio how they start the day. Almost every answer involved a warm drink and a few minutes before the rest of the house wakes up.' },
      { type: 'p', text: 'None of it is complicated. The point is the pause: a mug that feels good in two hands, a window, and nothing that pings.' },
      { type: 'quote', text: 'I make the tea, then I drink the tea. That is the whole ritual.', cite: 'Someone in the packing room' },
      { type: 'products', ids: ['hk-mug', 'pl-robe', 'oa-mist'], caption: 'For slower mornings' },
    ],
  },
];
