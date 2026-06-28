import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

type FieldProps = {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/**
 * Form field row matching design system §08 (Forms & dialogs):
 *   - 12.5px label (`<Label>` from shadcn)
 *   - 36px control (caller's children — Input, Select, etc.)
 *   - 12px helper or 12px error (mutually exclusive — error wins)
 *
 * Use this for new forms. Existing forms can adopt opportunistically.
 */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: FieldProps): React.JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="flex items-center gap-1">
        <span>{label}</span>
        {required ? (
          <span className="text-[var(--color-err)]" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--color-err)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
