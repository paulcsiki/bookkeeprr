import type { NotifyEvent } from './events';
import type { SeriesRow } from '@/server/db/schema';
import type { ContentType } from '@bookkeeprr/types/pure';

/** A single key/value row in a rich (Discord) embed. */
export type NotificationField = { name: string; value: string; inline?: boolean };

/**
 * Rich-embed payload. Only Discord renders this; apprise/push fall back to the
 * flat `title`/`body`. Mirrors the Sonarr-style layout: an event label, an
 * overview, inline metadata fields, a monospace release block, and the cover
 * shown as both the thumbnail and the large image.
 */
export type NotificationEmbed = {
  title: string;
  eventLabel: string;
  overview: string | null;
  fields: NotificationField[];
  releaseTitle: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  url: string | null;
};

export type FormattedNotification = {
  title: string;
  body: string;
  color: number;
  level: 'info' | 'success' | 'failure';
  embed?: NotificationEmbed;
};

const COLOR_GRAB = 0x3b82f6;
const COLOR_IMPORT = 0x22c55e;
const COLOR_FAILURE = 0xef4444;
const COLOR_TEST = 0x6b7280;
const COLOR_UPDATE = 0xa855f7;

const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  manga: 'Manga',
  comic: 'Comic',
  light_novel: 'Light novel',
  ebook: 'eBook',
  audiobook: 'Audiobook',
};

function seriesTitle(s: SeriesRow): string {
  return s.titleEnglish ?? s.titleRomaji ?? s.titleNative ?? `series #${s.id}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

/** Discord can only render a cover it can fetch itself — an absolute http(s) URL.
 *  Proxied/relative cover paths (e.g. /api/img, auth-gated) are dropped. */
function publicCover(s: SeriesRow): string | null {
  return s.coverUrl && /^https?:\/\//i.test(s.coverUrl) ? s.coverUrl : null;
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Markdown links to whichever external metadata sources we have ids for. */
function metadataLinks(s: SeriesRow): string | null {
  const links: string[] = [];
  if (s.openlibraryId) {
    const path = s.openlibraryId.startsWith('/') ? s.openlibraryId : `/works/${s.openlibraryId}`;
    links.push(`[OpenLibrary](https://openlibrary.org${path})`);
  }
  if (s.googleBooksVolumeId) {
    links.push(
      `[Google Books](https://books.google.com/books?id=${encodeURIComponent(s.googleBooksVolumeId)})`,
    );
  }
  if (s.anilistId) links.push(`[AniList](https://anilist.co/manga/${s.anilistId})`);
  return links.length > 0 ? links.join(' · ') : null;
}

/** The common metadata fields shared by grab/import embeds. */
function seriesFields(s: SeriesRow, extra: NotificationField[] = []): NotificationField[] {
  const fields: NotificationField[] = [];
  if (s.author) fields.push({ name: 'Author', value: s.author, inline: true });
  fields.push({ name: 'Format', value: CONTENT_TYPE_LABEL[s.contentType], inline: true });
  if (s.startYear) fields.push({ name: 'Published', value: String(s.startYear), inline: true });
  fields.push(...extra);
  const links = metadataLinks(s);
  if (links) fields.push({ name: 'Links', value: links, inline: false });
  return fields;
}

export function formatEvent(event: NotifyEvent): FormattedNotification {
  switch (event.kind) {
    case 'grab-success': {
      const s = event.series;
      return {
        title: `Grabbed: ${seriesTitle(s)}`,
        body: [
          event.release.title,
          `${formatBytes(event.release.sizeBytes)}  ·  ${event.indexerName}`,
        ].join('\n'),
        color: COLOR_GRAB,
        level: 'info',
        embed: {
          title: s.author ? `${seriesTitle(s)} — ${s.author}` : seriesTitle(s),
          eventLabel: 'Grabbed',
          overview: s.description ? truncate(s.description, 600) : null,
          fields: seriesFields(s, [
            { name: 'Size', value: formatBytes(event.release.sizeBytes), inline: true },
            { name: 'Indexer', value: event.indexerName, inline: true },
          ]),
          releaseTitle: event.release.title,
          thumbnailUrl: publicCover(s),
          imageUrl: publicCover(s),
          url: null,
        },
      };
    }
    case 'import-success': {
      const s = event.series;
      const noun = event.count === 1 ? 'file' : 'files';
      return {
        title: `Imported: ${seriesTitle(s)}`,
        body: `Imported ${event.count} ${noun} of ${seriesTitle(s)}`,
        color: COLOR_IMPORT,
        level: 'success',
        embed: {
          title: s.author ? `${seriesTitle(s)} — ${s.author}` : seriesTitle(s),
          eventLabel: 'Import complete',
          overview: s.description ? truncate(s.description, 600) : null,
          fields: seriesFields(s, [
            { name: 'Imported', value: `${event.count} ${noun}`, inline: true },
          ]),
          releaseTitle: null,
          thumbnailUrl: publicCover(s),
          imageUrl: publicCover(s),
          url: null,
        },
      };
    }
    case 'failure': {
      const title = `Failure during ${event.stage}: ${
        event.series ? seriesTitle(event.series) : '(no series)'
      }`;
      const lines = [`[${event.error.code}] ${event.error.message}`];
      if (event.release) lines.push(event.release.title);
      return {
        title,
        body: lines.join('\n'),
        color: COLOR_FAILURE,
        level: 'failure',
        embed: {
          title: event.series ? seriesTitle(event.series) : 'Failure',
          eventLabel: `Failed during ${event.stage}`,
          overview: `**[${event.error.code}]** ${event.error.message}`,
          fields: event.series ? seriesFields(event.series) : [],
          releaseTitle: event.release?.title ?? null,
          thumbnailUrl: event.series ? publicCover(event.series) : null,
          imageUrl: event.series ? publicCover(event.series) : null,
          url: null,
        },
      };
    }
    case 'update-available':
      return {
        title: `bookkeeprr ${event.latestVersion} available`,
        body: [`Currently running ${event.currentVersion}.`, event.releaseUrl].join('\n'),
        color: COLOR_UPDATE,
        level: 'info',
      };
    case 'test':
      return {
        title: 'bookkeeprr notification test',
        body: 'This is a test notification. If you can read this, the channel works.',
        color: COLOR_TEST,
        level: 'info',
      };
  }
}
