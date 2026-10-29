import { forwardRef, useId } from 'react';
import { CircleAlert } from 'lucide-react';
import { normalizeTimeInput } from '../lib/format.js';

function FieldShell({ id, label, hint, error, optionalText, children }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {optionalText && <span className="ml-1.5 font-normal text-ink-400">{optionalText}</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function describedBy(id, error, hint) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export const TextField = forwardRef(function TextField(
  { label, hint, error, optionalText, onChange, className = '', ...rest },
  ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optionalText={optionalText}>
      <input
        ref={ref}
        id={id}
        className={`input ${error ? 'input-error' : ''} ${className}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      />
    </FieldShell>
  );
});

// 24-hour time entry. Plain text (not <input type="time">) so every browser
// and locale shows HH:MM, never AM/PM. "815" is tidied to "08:15" on blur.
export const TimeField = forwardRef(function TimeField(
  { label, hint, error, value, onChange, ...rest },
  ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        placeholder="HH:MM"
        value={value}
        className={`input font-medium tabular-nums ${error ? 'input-error' : ''}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9:]/g, ''))}
        onBlur={(e) => onChange(normalizeTimeInput(e.target.value))}
        {...rest}
      />
    </FieldShell>
  );
});

export function SelectField({ label, hint, error, value, onChange, children, ...rest }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9 ${error ? 'input-error' : ''}`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%2352637F' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 8 5 5 5-5'/%3E%3C/svg%3E\")",
        }}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}
