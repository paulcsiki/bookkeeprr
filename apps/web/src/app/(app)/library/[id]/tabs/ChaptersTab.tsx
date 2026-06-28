'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VirtualList } from '@/components/ui/virtual-list';
import { apiFetch } from '@/lib/api-fetch';
import type { ChapterRow, LibraryFileRow, VolumeRow } from '@/server/db/schema';
import { RerouteSheet } from '../RerouteSheet';

type Props = {
  seriesId: number;
  chapters: ChapterRow[];
  libraryFiles: LibraryFileRow[];
  volumes: VolumeRow[];
  /** Volume ids that own a library file. A chapter inside a present volume is
   *  itself present even without its own file (volume-format series). */
  presentVolumeIds?: ReadonlySet<number>;
  /** AniList's aggregate chapter count, for the "N of M synced" hint. */
  totalChapters?: number | null;
  /** Chapter ids the current user has marked read. */
  readChapterIds?: ReadonlySet<number>;
};

/** Shape of `GET /api/series/[id]/toc`. */
type SeriesTocResponse = {
  fileId: number | null;
  entries: { title: string; loc: string }[];
};

/**
 * Presentation for the book's in-file TOC (EPUB/PDF). Each entry deep-links the
 * reader to that location via `?loc=`. Renders nothing when there is no present
 * readable file (cbz/cbr comics, or no file) or no extractable in-book TOC.
 */
export function BookTocList({
  fileId,
  entries,
}: {
  fileId: number | null;
  entries: { title: string; loc: string }[];
}): React.JSX.Element | null {
  if (fileId === null || entries.length === 0) return null;
  return (
    <section className="mb-6">
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        In-book contents
      </h3>
      <div className="overflow-hidden rounded-lg border border-border bg-elevated">
        <ul>
          {entries.map((e, i) => (
            <li
              key={`${e.loc}-${i}`}
              className="flex items-center gap-3 border-b border-border px-4 py-2 text-[13px] text-foreground/80 last:border-b-0 hover:bg-hover"
            >
              <span className="font-mono text-[11px] text-muted-foreground">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="flex-1 truncate">{e.title}</span>
              <Button asChild size="sm" variant="outline">
                <Link href={`/read/f/${fileId}?loc=${encodeURIComponent(e.loc)}`}>
                  <BookOpen className="h-3.5 w-3.5" />
                  Read
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Fetches the series' book TOC and renders it via {@link BookTocList}. Renders
 * nothing for series whose present file has no usable in-book TOC.
 */
function BookTocSection({ seriesId }: { seriesId: number }): React.JSX.Element | null {
  const { data } = useQuery<SeriesTocResponse, Error>({
    queryKey: ['series-toc', seriesId],
    queryFn: async () => {
      const r = await apiFetch(`/api/series/${seriesId}/toc`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<SeriesTocResponse>;
    },
    // The TOC only changes when the file is re-imported; building it re-parses
    // the epub, so don't re-fetch on every tab switch.
    staleTime: 5 * 60_000,
  });

  if (!data) return null;
  return <BookTocList fileId={data.fileId} entries={data.entries} />;
}

// design-system .dtable: shared column grid; header + body styled separately.
const COLS = 'grid grid-cols-[4rem_1fr_4rem_7rem_6rem_3rem_12rem] gap-3';
const HEAD_ROW = `${COLS} items-center bg-elevated px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground`;
const BODY_ROW = `${COLS} items-center border-t border-border px-4 py-2 text-[13px] text-foreground/80`;

/**
 * A chapter is present when it owns a library file, or its parent volume is
 * present (volume-format series store chapters inside a volume's single file).
 */
export function isChapterPresent(
  hasOwnFile: boolean,
  volumeId: number | null,
  presentVolumeIds?: ReadonlySet<number>,
): boolean {
  if (hasOwnFile) return true;
  return volumeId != null && (presentVolumeIds?.has(volumeId) ?? false);
}

export function ChaptersTab({
  seriesId,
  chapters,
  libraryFiles,
  volumes,
  presentVolumeIds,
  totalChapters,
  readChapterIds,
}: Props): React.JSX.Element {
  const router = useRouter();
  const [rerouting, setRerouting] = useState<{ id: number; path: string } | null>(null);
  const [readIds, setReadIds] = useState<ReadonlySet<number>>(
    () => new Set(readChapterIds ?? []),
  );

  async function toggleRead(chapterId: number, next: boolean): Promise<void> {
    // Optimistic flip.
    setReadIds((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(chapterId);
      else updated.delete(chapterId);
      return updated;
    });
    try {
      const res = await fetch(`/api/series/${seriesId}/chapters/${chapterId}/read`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ read: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Revert on failure.
      setReadIds((prev) => {
        const updated = new Set(prev);
        if (next) updated.delete(chapterId);
        else updated.add(chapterId);
        return updated;
      });
      toast.error('Could not update read state');
    }
  }

  const hasTotal = totalChapters != null && totalChapters > 0;

  if (chapters.length === 0) {
    return (
      <>
        <BookTocSection seriesId={seriesId} />
        <p className="text-muted-foreground mt-4 text-[13px]">
          {hasTotal ? (
            <>
              <span className="font-mono">0</span> of{' '}
              <span className="font-mono">{totalChapters}</span> chapters synced — none available on
              connected sources yet.
            </>
          ) : (
            'No chapters yet; MangaDex sync may still be running.'
          )}
        </p>
      </>
    );
  }
  const filesByChapter = new Map<number, LibraryFileRow>();
  for (const f of libraryFiles) {
    if (f.chapterId !== null) filesByChapter.set(f.chapterId, f);
  }
  const volNumberById = new Map(volumes.map((v) => [v.id, v.number]));
  return (
    <>
      <BookTocSection seriesId={seriesId} />
      {hasTotal && (
        <p className="mb-2 text-[13px] text-muted-foreground">
          <span className="font-mono">{chapters.length}</span> of{' '}
          <span className="font-mono">{totalChapters}</span> chapters synced
        </p>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-elevated">
        {/* Column header */}
        <div className={HEAD_ROW}>
          <span>Ch</span>
          <span>Title</span>
          <span>Vol</span>
          <span>Release</span>
          <span>Status</span>
          <span>Read</span>
          <span>Actions</span>
        </div>

        <VirtualList
          items={chapters}
          estimateSize={() => 48}
          keyExtractor={(c) => c.id}
          className="h-[600px]"
          renderItem={(c) => {
            const lf = filesByChapter.get(c.id);
            const volNumber = c.volumeId != null ? volNumberById.get(c.volumeId) : undefined;
            const volumePresent = c.volumeId != null && (presentVolumeIds?.has(c.volumeId) ?? false);
            const present = isChapterPresent(lf != null, c.volumeId, presentVolumeIds);
            // Prefer the chapter's own file in the reader; otherwise open the
            // containing volume's reader.
            const readHref = lf
              ? `/read/f/${lf.id}`
              : volumePresent && c.volumeId != null
                ? `/read/v/${c.volumeId}`
                : null;
            return (
              <div className={`${BODY_ROW} h-12 hover:bg-hover`}>
                <span className="font-mono">{c.numberText}</span>
                <span>{c.title?.trim() ? c.title : `Chapter ${c.numberText}`}</span>
                <span className="font-mono">{volNumber != null ? `Vol ${volNumber}` : '—'}</span>
                <span className="font-mono">
                  {c.releaseDate ? new Date(c.releaseDate).toLocaleDateString() : '—'}
                </span>
                <span>
                  {present ? (
                    <Badge>Owned</Badge>
                  ) : (
                    <Badge className="border-transparent bg-muted text-foreground">Missing</Badge>
                  )}
                </span>
                <span>
                  {(() => {
                    const isRead = readIds.has(c.id);
                    return (
                      <button
                        type="button"
                        aria-pressed={isRead}
                        aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
                        title={isRead ? 'Read — click to mark unread' : 'Mark as read'}
                        onClick={() => void toggleRead(c.id, !isRead)}
                        className={`grid h-7 w-7 place-items-center rounded-md border transition-colors ${
                          isRead
                            ? 'border-transparent bg-ok/15 text-ok'
                            : 'border-border text-muted-foreground hover:bg-hover hover:text-foreground'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    );
                  })()}
                </span>
                <span className="flex gap-2">
                  {readHref && (
                    <Button asChild size="sm">
                      <Link href={readHref}>
                        <BookOpen className="h-3.5 w-3.5" />
                        Read
                      </Link>
                    </Button>
                  )}
                  {lf && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRerouting({ id: lf.id, path: lf.path })}
                    >
                      Re-route
                    </Button>
                  )}
                </span>
              </div>
            );
          }}
        />
      </div>

      {rerouting && (
        <RerouteSheet
          libraryFileId={rerouting.id}
          currentPath={rerouting.path}
          onClose={() => setRerouting(null)}
          onSuccess={() => {
            setRerouting(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
