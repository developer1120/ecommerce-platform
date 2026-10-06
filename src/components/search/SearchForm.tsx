import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { Button, TextField } from '@/components/ui';
import { cx } from '@/lib/cx';
import { searchUrl } from './SearchPanel';
import styles from './SearchForm.module.css';

interface SearchFormProps {
  /** What the box starts with, e.g. the current query. */
  initial?: string;
  className?: string;
}

/** A search box set into a page, for refining a search or starting one from there. */
export function SearchForm({ initial = '', className }: SearchFormProps) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);

  return (
    <form
      role="search"
      aria-label="Search the shop"
      className={cx(styles.form, className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) navigate(searchUrl(value));
      }}
    >
      <TextField
        label="Search for"
        hideLabel
        type="search"
        placeholder="Linen, ceramics, gifts…"
        leading={<Search />}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={styles.field}
        enterKeyHint="search"
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
