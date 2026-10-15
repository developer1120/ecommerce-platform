import { Badge, type BadgeTone } from '@/components/ui';
import { PO_STATUS_LABELS, type PurchaseOrderStatus } from '@/domain/purchasing';

const TONES: Record<PurchaseOrderStatus, BadgeTone> = {
  draft: 'neutral',
  sent: 'accent',
  partial: 'warning',
  received: 'success',
  cancelled: 'neutral',
};

export function PurchaseOrderBadge({ status }: { status: PurchaseOrderStatus }) {
  return <Badge tone={TONES[status]}>{PO_STATUS_LABELS[status]}</Badge>;
}

export const supplierPath = (name: string) => `/admin/purchasing/makers/${encodeURIComponent(name)}`;
export const purchaseOrderPath = (id: string) => `/admin/purchasing/${id}`;

const PO_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const formatPoDate = (iso: string) => PO_DATE.format(new Date(iso));
