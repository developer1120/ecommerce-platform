import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Hand } from 'lucide-react';
import { listProducts } from '@/api/catalogApi';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { HeadingIcon, ToggleChip } from '@/components/ui';
import { MAKERS } from '@/data/makers';
import type { Department } from '@/domain/product';
import { productsByMaker } from '@/domain/stories';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MakerCard } from './StoriesParts';
import styles from './Stories.module.css';

const DEPARTMENT_FILTERS: { value: Department; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'apparel', label: 'Apparel' },
  { value: 'beauty', label: 'Beauty' },
];

const isDepartment = (value: string | null): value is Department => DEPARTMENT_FILTERS.some((option) => option.value === value);

/** Every maker, filterable by the department they make for. */
export function MakersPage() {
  usePageTitle('Our makers');
  const products = useAsync((signal) => listProducts({}, { signal }), []);
  const [params, setParams] = useSearchParams();
  const requested = params.get('for');
  const department = isDepartment(requested) ? requested : null;

  const makers = useMemo(
    () =>
      MAKERS.map((maker) => ({ maker, products: productsByMaker(products.data ?? [], maker) })).filter(
        ({ products: own }) => department === null || own.some((product) => product.department === department),
      ),
    [products.data, department],
  );

  return (
    <div className={styles.page}>
      <Breadcrumbs trail={[{ label: 'Our story', to: '/about' }, { label: 'Makers' }]} />
      <header className={styles.header}>
        <h1 className={styles.title}>
          <HeadingIcon icon={Hand} badge />
          Our makers
        </h1>
        <p className={styles.lede}>
          Potters, weavers, knitters and herbalists. Every one of them is independent, and every piece in the shop is made by one of them.
        </p>
      </header>

      <div className={styles.chips} role="group" aria-label="Makers for">
        <ToggleChip selected={department === null} onToggle={() => setParams({}, { replace: true })}>
          Everyone
        </ToggleChip>
        {DEPARTMENT_FILTERS.map((option) => (
          <ToggleChip
            key={option.value}
            selected={department === option.value}
            onToggle={() => setParams(department === option.value ? {} : { for: option.value }, { replace: true })}
          >
            {option.label}
          </ToggleChip>
        ))}
      </div>

      <section aria-label="Makers" className={styles.grid}>
        {makers.map(({ maker, products: own }) => (
          <MakerCard key={maker.slug} maker={maker} productCount={own.length} level={2} />
        ))}
      </section>
    </div>
  );
}
