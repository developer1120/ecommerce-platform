import type { HelpTopic } from '@/domain/help';

/*
 * The help centre's answers, grouped by topic. Each answer is a list of
 * paragraphs. Figures here (prices, days, thresholds) match the shop's
 * settings; the help tests check the ones that could drift.
 */

export const HELP_TOPICS: HelpTopic[] = [
  {
    slug: 'shipping',
    title: 'Shipping and delivery',
    summary: 'Delivery options, costs, dispatch times and where we ship.',
    articles: [
      {
        id: 'shipping-options',
        question: 'What delivery options do you offer?',
        answer: [
          'Standard delivery costs $5.95 and takes 3 to 5 working days after dispatch. Express costs $14.95 and takes 1 to 2 working days. Next day costs $24.95 and arrives the working day after dispatch.',
          'You choose a delivery option at checkout, and the estimated arrival date is shown next to each one before you pay.',
        ],
        keywords: ['delivery', 'standard', 'express', 'next day', 'cost', 'price'],
      },
      {
        id: 'free-shipping',
        question: 'Do you offer free shipping?',
        answer: [
          'Yes. Orders of $75 or more, after any promo discount, ship free with standard delivery. The bag shows how far you are from free shipping as you shop.',
          'Some promo codes include free shipping on any order. Express and next-day delivery are charged at the usual rate on free-shipping orders, minus the standard price.',
        ],
        keywords: ['free', 'threshold', 'minimum', '75'],
      },
      {
        id: 'dispatch',
        question: 'When will my order be dispatched?',
        answer: [
          'We pack orders in the studio on weekdays. Most orders placed on a working day leave the same day or the next morning. Orders placed at the weekend are packed on Monday.',
          "We'll email you a tracking number as soon as your parcel is on its way.",
        ],
        keywords: ['dispatch', 'packed', 'ship', 'when', 'weekend', 'tracking'],
      },
      {
        id: 'remote-areas',
        question: 'Do you ship to Alaska, Hawaii and the territories?',
        answer: [
          'We do, with standard or express delivery. Parcels to Alaska, Hawaii and US territories carry a $10 surcharge, and next-day delivery is not available there.',
          'We only ship within the United States for now.',
        ],
        keywords: ['alaska', 'hawaii', 'puerto rico', 'international', 'abroad', 'surcharge', 'territories'],
      },
      {
        id: 'late-parcel',
        question: 'My parcel is late. What should I do?',
        answer: [
          'First check the tracking link in your dispatch email; carriers sometimes take a day longer than the estimate. If tracking has not moved for three working days, or says the parcel was delivered and you cannot find it, contact us with your order number and we will chase the carrier or send a replacement.',
        ],
        keywords: ['late', 'lost', 'missing', 'delayed', 'not arrived', 'stolen'],
      },
    ],
  },
  {
    slug: 'returns',
    title: 'Returns and refunds',
    summary: 'How to send something back, and when your refund arrives.',
    articles: [
      {
        id: 'return-window',
        question: 'How long do I have to return something?',
        answer: [
          'You have 30 days from the day your order arrives. Items should be unused and in their original packaging, except for faulty items, which we take back however used.',
          'Candles, beauty products and anything personalised can only be returned if they arrive damaged or faulty.',
        ],
        keywords: ['30 days', 'window', 'deadline', 'how long', 'unused'],
      },
      {
        id: 'start-return',
        question: 'How do I start a return?',
        answer: [
          'If you have an account, open the order from Your account → Orders and choose "Start a return". Pick the items, tell us why, and choose whether to drop the parcel off or book a pickup.',
          'If you checked out as a guest, contact us with your order number and we will start the return for you.',
        ],
        keywords: ['start', 'request', 'send back', 'label', 'pickup', 'drop off', 'guest'],
      },
      {
        id: 'refund-timing',
        question: 'When will I get my refund?',
        answer: [
          "We refund to your original payment method within two working days of your parcel reaching the studio. Your bank may take another 3 to 5 days to show it. You'll get an email when the refund is issued.",
          'The refund covers what you paid for the items, after any promo discount, plus their share of the tax. Original shipping costs are refunded only if the item was faulty or we sent the wrong thing.',
        ],
        keywords: ['refund', 'money back', 'how long', 'bank', 'shipping cost'],
      },
      {
        id: 'damaged',
        question: 'Something arrived broken. What now?',
        answer: [
          "We're sorry. Take a photo of the item and the packaging, then start a return with the reason \"Arrived damaged\", or contact us. We'll send a replacement or refund you in full, including shipping, and you won't need to post anything heavy back.",
        ],
        keywords: ['broken', 'damaged', 'cracked', 'faulty', 'chipped', 'replacement'],
      },
      {
        id: 'exchange',
        question: 'Can I exchange an item for a different size or colour?',
        answer: [
          'The quickest way is to return the item for a refund and place a new order for the size or colour you want, so it is not held up while your return travels back to us.',
        ],
        keywords: ['exchange', 'swap', 'size', 'colour', 'color'],
      },
    ],
  },
  {
    slug: 'orders',
    title: 'Orders',
    summary: 'Changing, cancelling and tracking an order.',
    articles: [
      {
        id: 'track-order',
        question: 'How do I track my order?',
        answer: [
          'Your dispatch email has a tracking link. If you have an account, every order and its tracking number are under Your account → Orders.',
        ],
        keywords: ['track', 'tracking', 'where', 'status'],
      },
      {
        id: 'change-order',
        question: 'Can I change or cancel my order?',
        answer: [
          'Contact us as soon as you can with your order number. Until the order is packed we can change the address, swap an item or cancel it. Once it has been dispatched, you can return it instead.',
