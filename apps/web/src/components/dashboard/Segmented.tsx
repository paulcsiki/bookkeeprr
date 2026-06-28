import { cn } from '@/lib/utils';

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

type Props<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** Accessible label for the control group. */
  'aria-label'?: string;
};

/**
 * A compact segmented control (period / metric toggles) — a sunken track with
 * the active segment filled in `--color-primary`. Bespoke rather than the gapped
 * `ToggleGroup` so it matches the dashboard's pill-track look. Behaves as a
 * single-select radio group.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  'aria-label': ariaLabel,
}: Props<T>): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex gap-0.5 rounded-[9px] border border-border bg-elevated p-[3px]"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'whitespace-nowrap rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-[5px] text-[11.5px]' : 'px-[13px] py-1.5 text-[12.5px]',
              on
                ? 'bg-primary text-primary-foreground'
                : 'bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
