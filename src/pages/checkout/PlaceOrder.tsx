import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CircleAlert, Lock } from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { isApiError } from '@/api/client';
import { placeOrder } from '@/api/ordersApi';
import { Button } from '@/components/ui';
import { reconcileCart, type CartNotice } from '@/domain/cartReconcile';
import { formatMoney, type Cents } from '@/domain/money';
import type { SavedCard } from '@/domain/payment';
import { useAuth } from '@/state/AuthProvider';
import { useCart } from '@/state/CartProvider';
import { useCheckout } from '@/state/CheckoutProvider';
import { markJustPlaced } from '@/state/justPlaced';
import { usePromo } from '@/state/PromoProvider';
import { useCheckoutTotals } from './CheckoutLayout';
import styles from './CheckoutStep.module.css';

type Problem =
  | { kind: 'declined'; message: string }
  | { kind: 'changed'; message: string; notices: CartNotice[] }
  | { kind: 'other'; message: string };

function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The last button. It sends the order with a key made once per visit, so a
 * double click or a retry after a network error can never charge twice.
 */
export function PlaceOrder({ total, card }: { total: Cents; card: SavedCard }) {
  const navigate = useNavigate();
  const { lines, replaceLines } = useCart();
  const { promotion } = usePromo();
  const { token } = useAuth();
  const { draft } = useCheckout();
  // The method actually priced, which differs from the draft when next day was swapped out for a remote state.
  const method = useCheckoutTotals().shipping.method;
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [placing, setPlacing] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  async function handlePlace() {
    if (placing) return;
    setPlacing(true);
    setProblem(null);
    try {
      const order = await placeOrder({
        idempotencyKey,
        lines,
        ...(promotion && { promoCode: promotion.code }),
        methodId: method.id,
        address: draft.address,
        card,
        ...(token && { sessionToken: token }),
      });
      // The confirmation page empties the bag once it is showing. Doing it here, while
      // checkout is still on screen, would make checkout bounce to the empty bag page.
      markJustPlaced(order.id);
      navigate(`/orders/${order.id}`, { state: { justPlaced: true } });
    } catch (error) {
      setPlacing(false);
      if (isApiError(error) && error.code === 'PAYMENT_DECLINED') {
        setProblem({ kind: 'declined', message: error.message });
      } else if (isApiError(error) && error.code === 'CONFLICT') {
        // Bring the bag up to date so the summary shows what will actually be charged.
        const notices = await refreshBag();
        setProblem({ kind: 'changed', message: error.message, notices });
      } else {
        setProblem({
          kind: 'other',
          message: isApiError(error)
            ? `${error.message} You have not been charged.`
            : 'Something went wrong and you have not been charged. Try again.',
        });
      }
    }
  }

  async function refreshBag(): Promise<CartNotice[]> {
    try {
      const products = await listProducts({ ids: [...new Set(lines.map((line) => line.productId))] });
      const result = reconcileCart({ lines }, products);
      if (result.changed) replaceLines(result.state.lines);
      return result.notices;
    } catch {
      return [];
    }
  }

  return (
    <div className={styles.placeOrder}>
      {problem && (
        <div className={styles.problem} role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <p className={styles.problemMessage}>{problem.message}</p>
            {problem.kind === 'changed' && problem.notices.length > 0 && (
              <ul>
                {problem.notices.map((notice) => (
                  <li key={`${notice.variantId}-${notice.kind}`}>{notice.message}</li>
                ))}
              </ul>
            )}
            {problem.kind === 'declined' && <Link to="/checkout/payment">Use a different card</Link>}
          </div>
        </div>
      )}
      <Button
        variant="accent"
        size="lg"
        block
        loading={placing}
        leadingIcon={<Lock />}
        onClick={handlePlace}
        disabled={lines.length === 0}
      >
        {placing ? 'Placing your order…' : `Place order · ${formatMoney(total)}`}
      </Button>
      <p className={styles.note}>
        By placing your order you agree to our terms of sale. This is a demo shop: nothing is charged and nothing ships.
      </p>
    </div>
  );
}
