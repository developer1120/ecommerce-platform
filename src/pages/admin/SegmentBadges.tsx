import { Badge, type BadgeTone } from '@/components/ui';
import { SEGMENT_LABELS, type CustomerSegment } from '@/domain/customers';
import styles from './Admin.module.css';

const SEGMENT_TONES: Record<CustomerSegment, BadgeTone> = {
  vip: 'success',
  repeat: 'accent',
  new: 'neutral',
  lapsed: 'warning',
  'no-orders': 'neutral',
};

export function SegmentBadges({ segments }: { segments: CustomerSegment[] }) {
  return (
    <span className={styles.badges}>
      {segments.map((segment) => (
        <Badge key={segment} tone={SEGMENT_TONES[segment]}>
          {SEGMENT_LABELS[segment]}
        </Badge>
      ))}
    </span>
  );
}
