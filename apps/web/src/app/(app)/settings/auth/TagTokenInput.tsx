'use client';

import { useState, type KeyboardEvent } from 'react';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Props = {
  id: string;
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
};

export function TagTokenInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState('');

  function commit(): void {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    if (value.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...value, trimmed]);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 min-h-9">
        {value.map((token) => (
          <button
            key={token}
            type="button"
            aria-label={`Remove ${token}`}
            onClick={() => onChange(value.filter((t) => t !== token))}
            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono hover:bg-muted/80"
          >
            <span>{token}</span>
            <span aria-hidden="true">×</span>
          </button>
        ))}
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={placeholder ?? 'Press Enter to add'}
          className="flex-1 min-w-32 border-0 bg-transparent px-1 py-0 h-7 shadow-none focus-visible:ring-0"
        />
      </div>
    </Field>
  );
}
