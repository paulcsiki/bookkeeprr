'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Check, Download, CloudOff } from 'lucide-react';
import type { ContentType } from '@bookkeeprr/types';
import { Cover } from '@/components/Cover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { libraryCoverSrc } from '@/server/images/allowlist';
import type { VolumeRow, LibraryFileRow } from '@/server/db/schema';
import { RerouteSheet } from '../RerouteSheet';
import { VolumesEmptyState } from './TabEmptyState';

type Props = {
  seriesId: number;
  volumes: VolumeRow[];
  libraryFiles: LibraryFileRow[];
  contentType: ContentType;
  cacheEnabled?: boolean;
  /** Per-volume read state for the current user (volumeId → state). */
  readStates?: ReadonlyMap<number, 'unread' | 'reading' | 'finished'>;
};

/** Parse the volume's metadata JSON; {} on absence/malformed. */
function parseMeta(metadataJson: string): { coverUrl?: unknown; releaseYear?: unknown } {
  try {
    const meta = JSON.parse(metadataJson) as Record<string, unknown>;
    return meta && typeof meta === 'object' ? meta : {};
  } catch {
    return {};
  }
}

/** Compact YYYY-MM-DD for the release line. */
function formatReleaseDate(value: VolumeRow['releaseDate']): string | null {
  if (value == null) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function VolumesTab({
  seriesId,
  volumes,
  libraryFiles,
  contentType,
  cacheEnabled = false,
  readStates,
}: Props): React.JSX.Element {
  const router = useRouter();
  const [rerouting, setRerouting] = useState<{ id: number; path: string } | null>(null);

  if (volumes.length === 0) {
    return <VolumesEmptyState seriesId={seriesId} />;
  }
  const filesByVolume = new Map<number, LibraryFileRow>();
  for (const f of libraryFiles) {
    if (f.volumeId !== null) filesByVolume.set(f.volumeId, f);
  }

  return (
    <>
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
        {volumes.map((v) => {
          const lf = filesByVolume.get(v.id);
          const read = readStates?.get(v.id) ?? 'unread';
          const title = v.title ?? `Volume ${v.number}`;
          const meta = parseMeta(v.metadataJson);
          const coverUrl = typeof meta.coverUrl === 'string' ? meta.coverUrl : null;
          // Precise date (MangaDex) wins; else the year-only fallback (Open Library).
          const released =
            formatReleaseDate(v.releaseDate) ??
            (typeof meta.releaseYear === 'number' ? String(meta.releaseYear) : null);
          return (
            <div key={v.id} className="flex flex-col gap-2">
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border">
                <Cover
                  className="absolute inset-0"
                  src={libraryCoverSrc(coverUrl, cacheEnabled)}
                  contentType={contentType}
                  title={title}
                  alt={title}
                  hideType
                />
                {/* Owned/Missing as a compact icon (native-title tooltip) so it
                    doesn't crowd the read-state badge on narrow cards. */}
                <span className="absolute right-2 top-2" title={lf ? 'Owned' : 'Missing'}>
                  {lf ? (
                    <Badge className="px-1.5 py-1" aria-label="Owned">
                      <Download className="h-3.5 w-3.5" />
                    </Badge>
                  ) : (
                    <Badge
                      className="border-transparent bg-muted px-1.5 py-1 text-muted-foreground"
                      aria-label="Missing"
                    >
                      <CloudOff className="h-3.5 w-3.5" />
                    </Badge>
                  )}
                </span>
                {/* Read state — solid badge, top-left so it doesn't collide with
                    the Owned/Missing badge. Audiobooks say "Listened". */}
                {read === 'finished' ? (
                  <span className="absolute left-2 top-2">
                    <Badge className="gap-1 border-transparent bg-[var(--color-ok)] text-white">
                      <Check className="h-3 w-3" />
                      {contentType === 'audiobook' ? 'Listened' : 'Read'}
                    </Badge>
                  </span>
                ) : read === 'reading' ? (
                  <span className="absolute left-2 top-2">
                    <Badge className="gap-1 border-transparent bg-primary text-primary-foreground">
                      <BookOpen className="h-3 w-3" />
                      In Progress
                    </Badge>
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Vol {v.number}
                </div>
                <div className="truncate text-[13px] text-foreground" title={title}>
                  {title}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">{released ?? '—'}</div>
              </div>
              {lf && (
                <div className="flex gap-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/read/v/${v.id}`}>
                      <BookOpen className="h-3.5 w-3.5" />
                      Read
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setRerouting({ id: lf.id, path: lf.path })}
                  >
                    Re-route
                  </Button>
                </div>
              )}
            </div>
          );
        })}
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
