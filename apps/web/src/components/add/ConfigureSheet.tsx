'use client';

import type { AddSheetTarget } from './result-adapter';
import { AddSheet } from './AddSheet';
import { ComicAddSheet } from '@/app/(app)/add/ComicAddSheet';
import { LightNovelAddSheet } from '@/app/(app)/add/LightNovelAddSheet';
import { EbookSingleSheet } from '@/app/(app)/add/ebook/EbookSingleSheet';
import { AudiobookAddSheet } from '@/app/(app)/add/audiobook/AudiobookAddSheet';

/**
 * Renders the per-type Add sheet for a configure target. Each sheet is a
 * self-contained Radix Sheet that calls `onClose` on dismiss. Shared by the
 * global AddDialog and the Discover detail modal so the "Add & configure" path
 * is identical across both.
 *
 * `groupId` is the AddDialog's "Add into" selection (null/omitted = Library
 * root) — forwarded into every sheet's POST /api/series body.
 */
export function ConfigureSheet({
  target,
  onClose,
  groupId = null,
}: {
  target: AddSheetTarget;
  onClose: () => void;
  groupId?: number | null;
}): React.JSX.Element {
  switch (target.type) {
    case 'manga':
      return <AddSheet hit={target.hit} groupId={groupId} onClose={onClose} />;
    case 'light_novel':
      return <LightNovelAddSheet hit={target.hit} groupId={groupId} onClose={onClose} />;
    case 'comic':
      return <ComicAddSheet hit={target.hit} groupId={groupId} onClose={onClose} />;
    case 'ebook':
      return <EbookSingleSheet hit={target.hit} groupId={groupId} onClose={onClose} />;
    case 'audiobook':
      return <AudiobookAddSheet hit={target.hit} groupId={groupId} onClose={onClose} />;
  }
}
