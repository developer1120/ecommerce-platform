import { useState } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, MessageSquareText, ThumbsUp } from 'lucide-react';
import { listReviews, markHelpful } from '@/api/reviewsApi';
import { LoadError } from '@/components/feedback/LoadError';
import { Badge, Button, HeadingIcon, Spinner } from '@/components/ui';
import type { Product } from '@/domain/product';
import { FIT_LABELS, type Review, type ReviewSort, type Stars } from '@/domain/reviews';
import { useAsync } from '@/hooks/useAsync';
import { isStringArray, readJson, writeJson } from '@/lib/storage';
import { useAuth } from '@/state/AuthProvider';
import { useToast } from '@/state/ToastProvider';
import { ReviewForm } from './ReviewForm';
import { StarRow } from './StarRow';
import styles from './Reviews.module.css';

const PAGE_SIZE = 5;
const VOTES_KEY = 'tanelt:helpful-votes';
const DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const numberFormat = new Intl.NumberFormat('en-US');

const SORTS: { value: ReviewSort; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'helpful', label: 'Most helpful' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest', label: 'Lowest rated' },
];

/** The reviews section of a product page: summary, filters, list and the form to add one. */
export function ProductReviews({ product }: { product: Product }) {
  const { status } = useAuth();
  const { toast } = useToast();
  const [sort, setSort] = useState<ReviewSort>('recent');
  const [stars, setStars] = useState<Stars | undefined>();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [writing, setWriting] = useState(false);
  const [voted, setVoted] = useState<string[]>(() => readJson(VOTES_KEY, [], isStringArray));

  const page = useAsync(
    (signal) => listReviews(product.id, { sort, ...(stars && { stars }), limit }, { signal }),
    [product.id, sort, stars, limit],
  );

  const summary = page.data?.summary;

  function vote(review: Review) {
    if (voted.includes(review.id)) return;
    const next = [...voted, review.id];
    setVoted(next);
    writeJson(VOTES_KEY, next);
    markHelpful(review.id).then(page.reload, () => undefined);
  }

  return (
    <section id="reviews" className={styles.section} aria-labelledby="reviews-title" tabIndex={-1}>
      <div className={styles.head}>
        <h2 id="reviews-title" className={styles.title}>
          <HeadingIcon icon={MessageSquareText} />
          Reviews
        </h2>
        {status === 'signed-in' ? (
          !writing && (
            <Button variant="secondary" onClick={() => setWriting(true)}>
              Write a review
            </Button>
          )
        ) : (
          <Link
            to={`/account/sign-in?next=${encodeURIComponent(`/product/${product.slug}#reviews`)}`}
            className={styles.signInToReview}
          >
            Sign in to write a review
          </Link>
        )}
      </div>

      {writing && (
        <ReviewForm
          productId={product.id}
          askFit={product.department === 'apparel'}
          onCancel={() => setWriting(false)}
          onSubmitted={() => {
            setWriting(false);
            setSort('recent');
            setStars(undefined);
            page.reload();
            toast({ title: 'Thanks for your review', description: 'It is now live on this page.' });
          }}
        />
      )}

      {summary && (
        <div className={styles.summary}>
          <div className={styles.score}>
            <p className={styles.average}>{summary.average.toFixed(1)}</p>
            <StarRow rating={summary.average} />
            <p className={styles.muted}>
              {numberFormat.format(summary.count)} {summary.count === 1 ? 'rating' : 'ratings'}
            </p>
          </div>
          <ul className={styles.bars} aria-label="Ratings by stars">
            {([5, 4, 3, 2, 1] as Stars[]).map((level) => {
              const count = summary.distribution[level - 1] ?? 0;
              const percent = summary.count ? Math.round((count / summary.count) * 100) : 0;
