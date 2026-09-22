import type { Question } from '@/domain/questions';

/*
 * Questions shoppers have asked over the years, with the studio's answers.
 * They ship with the catalog, like its reviews.
 */

const STUDIO = 'The Tanelt studio';

function seed(
  id: string,
  productId: string,
  question: string,
  askedBy: string,
  askedAt: string,
  answer: string,
  answeredAt: string,
  helpful: number,
): Question {
  return { id, productId, question, askedBy, askedAt, helpful, answer: { text: answer, by: STUDIO, answeredAt } };
}

export const SEED_QUESTIONS: Question[] = [
  seed('q-mug-1', 'hk-mug', 'Are these mugs dishwasher safe?', 'Priya S.', '2026-05-02T10:12:00Z', 'Yes. The glaze is fired at stoneware temperatures, so the dishwasher is fine. They are microwave safe too.', '2026-05-03T09:00:00Z', 31),
  seed('q-mug-2', 'hk-mug', 'How much does each mug hold?', 'Tom R.', '2026-06-14T16:40:00Z', 'About 350 ml (12 oz) filled to just below the rim.', '2026-06-15T08:30:00Z', 18),
  seed('q-mug-3', 'hk-mug', 'Does the speckle vary from mug to mug?', 'Lena K.', '2026-08-21T12:05:00Z', 'It does. Each one is glazed by hand, so the speckle and the tone of the rim differ a little across the set.', '2026-08-21T15:20:00Z', 9),
  seed('q-throw-1', 'ff-throw', 'Will the throw shrink in the wash?', 'Marcus D.', '2026-04-11T19:30:00Z', 'It is washed before it ships, so it has done its shrinking. Wash cool and line dry to keep it soft.', '2026-04-12T10:00:00Z', 24),
  seed('q-throw-2', 'ff-throw', 'Is it big enough for a queen bed?', 'Hana O.', '2026-07-02T08:15:00Z', 'It works across the foot of a queen bed. At 130 × 170 cm it is a sofa throw rather than a full cover.', '2026-07-02T13:45:00Z', 15),
  seed('q-carafe-1', 'lg-carafe', 'Can I pour hot water into the carafe?', 'Sam W.', '2026-03-28T07:50:00Z', 'Yes, it is borosilicate glass, so hot water and tea are fine. Avoid moving it straight from the fridge into very hot water.', '2026-03-28T11:10:00Z', 12),
  seed('q-board-1', 'gw-board', 'What oil should I use on the board?', 'Grace H.', '2026-02-19T18:00:00Z', 'Any food-safe mineral oil or a beeswax board butter. Oil it once a month, or whenever it starts to look dry.', '2026-02-20T09:30:00Z', 20),
  seed('q-taper-1', 'sl-taper', 'How long do the candles burn?', 'Iris M.', '2026-09-05T20:10:00Z', 'About eight hours each, out of a draught.', '2026-09-06T08:00:00Z', 14),
  seed('q-taper-2', 'sl-taper', 'Do they fit standard candle holders?', 'Noah B.', '2026-09-12T14:25:00Z', 'Yes, the base is the standard 2.2 cm.', '2026-09-12T16:00:00Z', 11),
  seed('q-shirt-1', 'ff-shirt', 'How does the shirt fit? I am between sizes.', 'Ada L.', '2026-05-30T09:00:00Z', 'It is cut relaxed, so most people between sizes take the smaller one. Our size guide has the chest measurement for each size.', '2026-05-30T12:30:00Z', 27),
  seed('q-shirt-2', 'ff-shirt', 'Is the linen see-through in the light colours?', 'Rosa P.', '2026-06-22T15:15:00Z', 'Oat is slightly sheer in bright sun; Sage and Ink are not.', '2026-06-23T08:45:00Z', 16),
  seed('q-crew-1', 'nw-crew', 'Is the merino itchy?', 'Ben T.', '2026-01-08T11:30:00Z', 'It is a fine 18.5 micron merino, which most people wear against the skin without any itch.', '2026-01-08T14:00:00Z', 22),
  seed('q-cord-1', 'nw-cord', 'What is the inside leg length?', 'Jo F.', '2026-02-02T10:20:00Z', 'About 78 cm on every size. They are easy to take up at the hem.', '2026-02-02T15:40:00Z', 13),
  seed('q-tote-1', 'pl-tote', 'Can the tote go in the washing machine?', 'Kit A.', '2026-07-18T13:10:00Z', 'Yes, on a cool cycle. Reshape it while damp and let it dry flat.', '2026-07-19T09:20:00Z', 8),
  seed('q-beanie-1', 'nw-beanie', 'Will the beanie fit a larger head?', 'Omar N.', '2026-10-01T17:45:00Z', 'The rib stretches comfortably to about 62 cm.', '2026-10-02T08:10:00Z', 6),
  seed('q-mask-1', 'ra-mask', 'Is the mask suitable for sensitive skin?', 'Mei C.', '2026-03-03T19:00:00Z', 'It is fragrance free and made with kaolin and rose clay, which are gentle. Try it on a small patch first if your skin reacts easily.', '2026-03-04T10:00:00Z', 19),
  seed('q-soap-1', 'ra-soap', 'How long does a bar last?', 'Dan G.', '2026-04-25T08:40:00Z', 'Around six weeks of daily use if it dries between uses.', '2026-04-25T12:00:00Z', 10),
  seed('q-soap-2', 'ra-soap', 'Is the soap vegan?', 'Ava R.', '2026-08-09T16:30:00Z', 'Yes, it is made with olive and coconut oils and no animal products.', '2026-08-10T09:15:00Z', 21),
  seed('q-oil-1', 'ra-oil', 'Can I use the face oil under make-up?', 'Lia V.', '2026-05-15T07:20:00Z', 'Yes. Two drops warmed between the palms and pressed in; give it a minute before make-up.', '2026-05-15T11:00:00Z', 12),
  seed('q-mist-1', 'oa-mist', 'Is the pillow mist safe on silk?', 'Eve J.', '2026-06-06T21:05:00Z', 'Mist from about 30 cm and it dries without marks on silk and linen alike.', '2026-06-07T09:00:00Z', 7),
  seed('q-shamp-1', 'ra-shamp', 'Does the shampoo bar work on hard water?', 'Finn E.', '2026-09-19T08:55:00Z', 'It lathers well in hard water. A splash of diluted cider vinegar afterwards helps if your hair feels heavy.', '2026-09-19T13:30:00Z', 9),
];
