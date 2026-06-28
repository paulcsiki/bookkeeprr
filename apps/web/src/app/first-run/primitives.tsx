'use client';

type FieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  right?: React.ReactNode;
  children: React.ReactNode;
};

export function Field({ label, htmlFor, hint, error, right, children }: FieldProps): React.JSX.Element {
  return (
    <div className="ob-field">
      <div className="ob-field-top">
        <label className="ob-label" htmlFor={htmlFor}>{label}</label>
        {right}
      </div>
      {children}
      {error ? <div className="ob-msg err">{error}</div> : hint ? <div className="ob-msg">{hint}</div> : null}
    </div>
  );
}

type ObInputProps = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  rightSlot?: React.ReactNode;
};

export function ObInput({
  id, value, onChange, type = 'text', placeholder, mono, autoFocus, invalid, inputMode, autoComplete, onKeyDown, rightSlot,
}: ObInputProps): React.JSX.Element {
  return (
    <div className={'ob-input' + (invalid ? ' is-invalid' : '')}>
      <input
        id={id}
        className={'ob-input-el' + (mono ? ' mono' : '')}
        value={value}
        type={type}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        inputMode={inputMode}
        spellCheck={false}
        autoComplete={autoComplete ?? 'off'}
        autoCapitalize="none"
        onChange={(e) => onChange(e.target.value)}
      />
      {rightSlot}
    </div>
  );
}

type ObBtnProps = {
  children: React.ReactNode;
  variant?: 'primary' | 'outline' | 'ghost';
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
  loading?: boolean;
  size?: 'sm';
  type?: 'button' | 'submit';
};

export function ObBtn({
  children, variant = 'primary', onClick, disabled, full, loading, size, type = 'button',
}: ObBtnProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={`ob-btn ob-btn-${variant}${full ? ' full' : ''}${size === 'sm' ? ' sm' : ''}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading && <span className="ob-spin" />}
      {children}
    </button>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button type="button" className="ob-toggle" data-on={on ? '1' : '0'} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

