import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TextField, type TextFieldProps } from './TextField';
import styles from './PasswordField.module.css';

/** A password input with a show/hide toggle that keeps its own accessible name in step. */
export const PasswordField = forwardRef<HTMLInputElement, Omit<TextFieldProps, 'type' | 'trailing'>>(
  function PasswordField(props, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <TextField
        ref={ref}
        {...props}
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="off"
        trailing={
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={visible}
            aria-label={visible ? 'Hide password' : 'Show password'}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        }
      />
    );
  },
);
