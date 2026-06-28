'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, FolderTree, Headphones, Magnet, Search } from 'lucide-react';
import { parseReadableKey } from '@bookkeeprr/types';
import { Cover } from '@/components/Cover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useBreadcrumbLabel } from '@/components/shell/BreadcrumbLabels';
import { InteractiveSearchDialog } from '@/components/search/InteractiveSearchDialog';
import { ManualGrabDialog } from '@/components/search/ManualGrabDialog';
import { RenameDialog } from '@/components/library/RenameDialog';
import { HydrationIndicator } from './HydrationIndicator';
import { OverviewTab } from './tabs/OverviewTab';
import { VolumesTab } from './tabs/VolumesTab';
import { ChaptersTab } from './tabs/ChaptersTab';
import { SettingsTab } from './tabs/SettingsTab';
import { ReleasesTab } from './tabs/ReleasesTab';
import { PartOfSeriesCard } from './tabs/PartOfSeriesCard';
import type {
  SeriesRow,
  VolumeRow,
  ChapterRow,
  LibraryFileRow,
  QualityProfileRow,
  BookSeriesRow,
} from '@/server/db/schema';
import {
  anilistMangaUrl,
  mangadexMangaUrl,
  novelUpdatesUrl,
  openLibraryUrl,
  googleBooksIsbnUrl,
  audibleUrl,
} from '@/lib/external-links';
import { libraryCoverSrc } from '@/server/images/allowlist';

type Props = {
  series: SeriesRow;
  volumes: VolumeRow[];
  chapters: ChapterRow[];
  libraryFiles: LibraryFileRow[];
  qualityProfiles: QualityProfileRow[];
  isAdmin?: boolean;
  /** When true, route cover URLs through the caching `/api/img` proxy. */
  cacheEnabled?: boolean;
  /** Chapter ids the current user has marked read. */
  readChapterIds?: ReadonlySet<number>;
  /** The readableKey to resume (most-recent in-progress readable), if any. */
  resumeReadableKey?: string | null;
  /** Per-volume read state for the current user (volumeId → state). Serialized
   *  as entries since a Map can't cross the server→client boundary. */
  volumeReadStates?: ReadonlyArray<[number, 'unread' | 'reading' | 'finished']>;
  /** Book series this title belongs to, if any (ebook/audiobook only). */
  bookSeries?: (BookSeriesRow & { memberCount: number }) | null;
};

/** Map a readableKey to its web reader route. */
function readerHref(readableKey: string): string | null {
  try {
    const p = parseReadableKey(readableKey);
    return p.kind === 'audio' ? `/read/v/${p.volumeId}` : `/read/f/${p.fileId}`;
  } catch {
    return null;
  }
}

export function SeriesDetail({
  series,
  volumes,
  chapters,
  libraryFiles,
  qualityProfiles,
  isAdmin = false,
  cacheEnabled = false,
  readChapterIds,
  resumeReadableKey = null,
  volumeReadStates = [],
  bookSeries = null,
}: Props): React.JSX.Element {
  const title = series.titleEnglish ?? series.titleRomaji ?? `Series #${series.id}`;
  const volumeReadStateMap = new Map(volumeReadStates);
  // A volume is "present" when it owns a library file. Volume-format series may
  // have no per-chapter files, so a chapter counts as present when its parent
  // volume is present.
  const presentVolumeIds = new Set(
    libraryFiles.map((f) => f.volumeId).filter((id): id is number => id !== null),
  );
  // A single ebook (or any audiobook) is one item, not a volume set — hide the
  // Volumes tab for it. Ebook *series* (totalVolumes > 1), manga, comic, and
  // light novels keep Volumes. The volume row may still exist for file/reader
  // linkage; this is a UI-only hide. Overview is always the default tab, so no
  // fallback is needed when Volumes is hidden.
  const isSingleEbook =
    series.contentType === 'ebook' && (series.totalVolumes ?? 1) <= 1;
  const showVolumes =
    series.granularity === 'volume' && series.contentType !== 'audiobook' && !isSingleEbook;
  // Single-item books (an audiobook, or a one-volume ebook) hide the Volumes tab,
  // so the only place to open the reader would be missing. Surface a Read/Listen
  // action in the header when the single item actually owns a file.
  const isSingleItem = isSingleEbook || series.contentType === 'audiobook';
  const readVolumeId = isSingleItem
    ? (libraryFiles.find((f) => f.volumeId !== null)?.volumeId ?? null)
    : null;
  const isAudio = series.contentType === 'audiobook';

  // Primary read CTA: resume the in-progress readable ("Continue reading"), else
  // open the lowest-numbered owned volume ("Read now"). Falls back to the
  // single-item file for audiobooks / single ebooks. Null when nothing is owned.
  const firstOwnedVolumeId =
    volumes
      .filter((v) => presentVolumeIds.has(v.id))
      .sort((a, b) => Number(a.number ?? 0) - Number(b.number ?? 0))[0]?.id ?? readVolumeId;
  const resumeHref = resumeReadableKey ? readerHref(resumeReadableKey) : null;
  const readCta: { href: string; label: string } | null = resumeHref
    ? { href: resumeHref, label: isAudio ? 'Continue listening' : 'Continue reading' }
    : firstOwnedVolumeId != null
      ? { href: `/read/v/${firstOwnedVolumeId}`, label: isAudio ? 'Listen' : 'Read now' }
      : null;

  // Releases tab is only useful while something is still missing. Hide it once
  // the series is fully acquired (you own every known volume/chapter) — a
  // complete series otherwise lists releases that all resolve to "in library".
  // Interactive search stays available for manual upgrades. Completeness is
  // unknown when the total isn't set, so we keep the tab visible in that case.
  const ownedChapterCount = new Set(
    libraryFiles.map((f) => f.chapterId).filter((id): id is number => id !== null),
  ).size;
  const isComplete = ((): boolean => {
    if (isSingleItem) return readVolumeId !== null;
    if (series.granularity === 'volume') {
      const total = series.totalVolumes ?? 0;
      return total > 0 && presentVolumeIds.size >= total;
    }
    const total = series.totalChapters ?? 0;
    return total > 0 && ownedChapterCount >= total;
  })();
  const showReleases = !isComplete;
  const [searchOpen, setSearchOpen] = useState(false);
  const [manualGrabOpen, setManualGrabOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  // The top-bar breadcrumb is URL-derived and would show the raw id; register
  // the series name so it reads "… › Bunny Drop" instead of "… › 2".
  useBreadcrumbLabel(`/library/${series.id}`, title);
  return (
    <div className="space-y-6">
      <header className="flex gap-6">
        <div className="relative w-40 aspect-[2/3] flex-shrink-0 overflow-hidden rounded-md border border-border">
          <Cover
            className="absolute inset-0"
            src={libraryCoverSrc(series.coverUrl, cacheEnabled)}
            contentType={series.contentType}
            title={title}
            alt={title}
            loading="eager"
          />
        </div>
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
            <HydrationIndicator seriesId={series.id} />
          </div>
          {series.titleRomaji && series.titleRomaji !== title && (
            <p className="text-muted-foreground">{series.titleRomaji}</p>
          )}
          {series.titleNative && <p className="text-muted-foreground">{series.titleNative}</p>}
          <div className="flex gap-2 items-center">
            <Badge>{series.status}</Badge>
            <Badge variant="outline">monitoring: {series.monitoring}</Badge>
            <Badge variant="outline">{series.granularity}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {series.anilistId != null && (
              <a
                href={anilistMangaUrl(series.anilistId)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-primary"
              >
                AniList ↗
              </a>
            )}
            {series.mangadexId && (
              <a
                href={mangadexMangaUrl(series.mangadexId)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-primary"
              >
                MangaDex ↗
              </a>
            )}
            {series.novelUpdatesSlug && (
              <a
                href={novelUpdatesUrl(series.novelUpdatesSlug)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-primary"
              >
                NovelUpdates ↗
              </a>
            )}
            {series.contentType === 'ebook' && series.openlibraryId && (
              <a
                href={openLibraryUrl(series.openlibraryId)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-primary"
              >
                OpenLibrary ↗
              </a>
            )}
            {series.contentType === 'ebook' && series.isbn && (
              <a
                href={googleBooksIsbnUrl(series.isbn)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-primary"
              >
                Google Books ↗
              </a>
            )}
            {series.contentType === 'audiobook' && series.asin && (
              <a
                href={audibleUrl(series.asin)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-primary"
              >
                Audible ↗
              </a>
            )}
            {readCta && (
              <Button asChild size="sm">
                <Link href={readCta.href}>
                  {isAudio ? (
                    <Headphones className="h-3.5 w-3.5" />
                  ) : (
                    <BookOpen className="h-3.5 w-3.5" />
                  )}
                  {readCta.label}
                </Link>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)}>
              <Search className="h-3.5 w-3.5" />
              Interactive search
            </Button>
            <Button size="sm" variant="outline" onClick={() => setManualGrabOpen(true)}>
              <Magnet className="h-3.5 w-3.5" />
              Add manually
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRenameOpen(true)}>
              <FolderTree className="h-3.5 w-3.5" />
              Organize
            </Button>
          </div>
        </div>
      </header>

      {bookSeries &&
        (series.contentType === 'ebook' || series.contentType === 'audiobook') && (
          <PartOfSeriesCard bookSeries={bookSeries} />
        )}

      <InteractiveSearchDialog
        seriesId={series.id}
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />

      <ManualGrabDialog
        seriesId={series.id}
        open={manualGrabOpen}
        onOpenChange={setManualGrabOpen}
      />

      <RenameDialog seriesId={series.id} open={renameOpen} onOpenChange={setRenameOpen} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {showVolumes && (
            <TabsTrigger value="volumes">Volumes ({volumes.length})</TabsTrigger>
          )}
          {chapters.length > 0 && (
            <TabsTrigger value="chapters">Chapters ({chapters.length})</TabsTrigger>
          )}
          {showReleases && <TabsTrigger value="releases">Releases</TabsTrigger>}
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab series={series} isAdmin={isAdmin} />
        </TabsContent>
        {showVolumes && (
          <TabsContent value="volumes">
            <VolumesTab
              seriesId={series.id}
              volumes={volumes}
              libraryFiles={libraryFiles}
              contentType={series.contentType}
              cacheEnabled={cacheEnabled}
              readStates={volumeReadStateMap}
            />
          </TabsContent>
        )}
        {chapters.length > 0 && (
          <TabsContent value="chapters">
            <ChaptersTab
              seriesId={series.id}
              chapters={chapters}
              libraryFiles={libraryFiles}
              volumes={volumes}
              presentVolumeIds={presentVolumeIds}
              totalChapters={series.totalChapters}
              readChapterIds={readChapterIds}
            />
          </TabsContent>
        )}
        {showReleases && (
          <TabsContent value="releases">
            <ReleasesTab seriesId={series.id} />
          </TabsContent>
        )}
        <TabsContent value="settings">
          <SettingsTab
            series={series}
            qualityProfiles={qualityProfiles}
            bookSeries={bookSeries}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
