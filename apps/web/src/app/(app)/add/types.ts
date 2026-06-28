export type EbookHit = {
  olid: string;
  title: string;
  author: string | null;
  firstPublishYear: number | null;
  isbn: string | null;
  coverUrl: string | null;
  description: string | null;
};

export type AudiobookHit = {
  // Null when the audiobook came from a source without an Audible ASIN (iTunes /
  // NYT / LibriVox that couldn't be resolved). The audiobook is still addable —
  // it's keyed by title and grabbed via indexers.
  asin: string | null;
  title: string;
  author: string | null;
  narrator: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
  runtimeMinutes: number | null;
  description: string | null;
};
