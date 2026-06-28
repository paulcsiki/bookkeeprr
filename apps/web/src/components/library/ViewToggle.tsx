'use client';

import { LayoutGrid, List } from 'lucide-react';

type Props = {
  value: 'grid' | 'list';
  onChange: (v: 'grid' | 'list') => void;
};

/**
 * Grid/List view toggle — renders the design's canonical `.tabs / .tab` pill.
 * Subsumed by LibraryControlBar but kept as a composable primitive.
 */
export function ViewToggle({ value, onChange }: Props): React.JSX.Element {
  return (
    <div className="tabs" role="group" aria-label="Library view">
      <button
        type="button"
        className={`tab${value === 'grid' ? ' active' : ''}`}
        onClick={() => onChange('grid')}
        aria-pressed={value === 'grid'}
        aria-label="Grid view"
      >
        <LayoutGrid width={13} height={13} strokeWidth={1.6} style={{ marginRight: 6, verticalAlign: -2 }} />
        Grid
      </button>
      <button
        type="button"
        className={`tab${value === 'list' ? ' active' : ''}`}
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        aria-label="List view"
      >
        <List width={13} height={13} strokeWidth={1.6} style={{ marginRight: 6, verticalAlign: -2 }} />
        List
      </button>
    </div>
  );
}
