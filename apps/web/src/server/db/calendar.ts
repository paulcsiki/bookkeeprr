import { and, eq, gte, isNotNull, lt } from 'drizzle-orm';
import { getDb } from './client';
import { series, volumes } from './schema';
import type { ContentType } from '@/server/content-type';

export type CalendarEntry = {
  date: string;
  volumeId: number;
  volumeNumber: number;
  volumeTitle: string | null;
  seriesId: number;
  seriesTitle: string;
  contentType: ContentType;
  coverUrl: string | null;
  author: string | null;
  publisher: string | null;
  monitoring: 'none' | 'all' | 'future' | 'missing';
};

function toYmdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function listCalendarEntries(from: Date, to: Date): Promise<CalendarEntry[]> {
  const rows = await getDb()
    .select({
      volumeId: volumes.id,
      volumeNumber: volumes.number,
      volumeTitle: volumes.title,
      releaseDate: volumes.releaseDate,
      seriesId: series.id,
      contentType: series.contentType,
      titleEnglish: series.titleEnglish,
      titleRomaji: series.titleRomaji,
      titleNative: series.titleNative,
      coverUrl: series.coverUrl,
      author: series.author,
      publisher: series.publisher,
      monitoring: series.monitoring,
    })
    .from(volumes)
    .innerJoin(series, eq(volumes.seriesId, series.id))
    .where(
      and(
        isNotNull(volumes.releaseDate),
        gte(volumes.releaseDate, from),
        lt(volumes.releaseDate, to),
      ),
    );

  return rows
    .filter((r): r is typeof r & { releaseDate: Date } => r.releaseDate !== null)
    .map((r) => ({
      date: toYmdUtc(r.releaseDate),
      volumeId: r.volumeId,
      volumeNumber: r.volumeNumber,
      volumeTitle: r.volumeTitle,
      seriesId: r.seriesId,
      seriesTitle: r.titleEnglish ?? r.titleRomaji ?? r.titleNative ?? `Series #${r.seriesId}`,
      contentType: r.contentType,
      coverUrl: r.coverUrl,
      author: r.author,
      publisher: r.publisher,
      monitoring: r.monitoring,
    }))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.seriesTitle !== b.seriesTitle) return a.seriesTitle.localeCompare(b.seriesTitle);
      return a.volumeNumber - b.volumeNumber;
    });
}
