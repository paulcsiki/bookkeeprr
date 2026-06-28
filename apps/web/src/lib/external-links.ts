export function anilistMangaUrl(anilistId: number): string {
  return `https://anilist.co/manga/${anilistId}`;
}

export function mangadexMangaUrl(mangadexId: string): string {
  return `https://mangadex.org/title/${mangadexId}`;
}

export function novelUpdatesUrl(slug: string): string {
  return `https://www.novelupdates.com/series/${slug}/`;
}

/**
 * OpenLibrary deep link. Edition ids end in `M` (→ `/books/<olid>`); work ids
 * end in `W` (→ `/works/<olid>`). Detect by the trailing letter.
 */
export function openLibraryUrl(olid: string): string {
  const path = olid.toUpperCase().endsWith('W') ? 'works' : 'books';
  return `https://openlibrary.org/${path}/${olid}`;
}

export function googleBooksIsbnUrl(isbn: string): string {
  return `https://books.google.com/books?vid=ISBN${encodeURIComponent(isbn)}`;
}

export function audibleUrl(asin: string): string {
  return `https://www.audible.com/pd/${encodeURIComponent(asin)}`;
}
