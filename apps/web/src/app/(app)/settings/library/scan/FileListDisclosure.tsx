'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { GroupSummary } from '@/app/api/scan/groups/route';

export function FileListDisclosure({ files }: { files: GroupSummary['files'] }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight className={'h-3 w-3 transition-transform ' + (open ? 'rotate-90' : '')} />
        {open ? 'Hide files' : 'Show files'}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 text-xs font-mono">
          {files.map((f) => (
            <li key={f.path} className="flex justify-between gap-3 text-muted-foreground">
              <span className="truncate">{f.path.split('/').pop()}</span>
              <span className="shrink-0">
                {f.volume !== null ? 'v' + f.volume : f.chapter !== null ? 'c' + f.chapter : '—'}
                {' · '}
                {f.confidence.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
