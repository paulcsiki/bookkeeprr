import { z } from 'zod';

const SearchDoc = z.object({
  key: z.string(),
  title: z.string(),
  author_name: z.array(z.string()).optional(),
  first_publish_year: z.number().int().optional(),
  isbn: z.array(z.string()).optional(),
  cover_i: z.number().int().optional(),
  number_of_pages_median: z.number().int().optional(),
  subject: z.array(z.string()).optional(),
});

export const SearchResponse = z.object({
  docs: z.array(SearchDoc),
  numFound: z.number().int(),
});
export type SearchDocT = z.infer<typeof SearchDoc>;

const WorkAuthorEntry = z.object({
  author: z.object({ key: z.string() }),
});

const WorkSeriesEntry = z.object({
  series: z.object({ key: z.string() }),
  position: z.string().optional(),
});

export const WorkRecord = z.object({
  key: z.string(),
  title: z.string(),
  description: z.union([z.string(), z.object({ value: z.string() })]).optional(),
  covers: z.array(z.number().int()).optional(),
  first_publish_date: z.string().optional(),
  authors: z.array(WorkAuthorEntry).optional(),
  subjects: z.array(z.string()).optional(),
  series: z.array(WorkSeriesEntry).optional(),
  alternate_titles: z.array(z.string()).optional(),
});
export type WorkRecordT = z.infer<typeof WorkRecord>;

// /isbn/<isbn>.json — a single edition record. We only need a subset of the
// full edition schema (publish_date and works back-reference).
export const EditionByIsbnRecord = z.object({
  key: z.string(),
  title: z.string().optional(),
  publish_date: z.string().optional(),
  works: z.array(z.object({ key: z.string() })).optional(),
});
export type EditionByIsbnRecordT = z.infer<typeof EditionByIsbnRecord>;

// /series/<key>.json — sparse. The live OpenLibrary series document does NOT
// carry a top-level `key` (its real keys are name/type/description/links/…), so
// `key` MUST stay optional or every series lookup fails shape validation and
// collection detection silently returns null.
export const OLSeriesRecord = z.object({
  key: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
});
export type OLSeriesRecordT = z.infer<typeof OLSeriesRecord>;

export const AuthorRecord = z.object({
  key: z.string(),
  name: z.string(),
});

// /trending/{period}.json returns a list of works. Fields mirror the search
// docs but the author lives in `author_name` (an array) just like search.
const TrendingWork = z.object({
  key: z.string(),
  title: z.string(),
  author_name: z.array(z.string()).optional(),
  first_publish_year: z.number().int().optional(),
  cover_i: z.number().int().optional(),
});

export const TrendingResponse = z.object({
  works: z.array(TrendingWork),
});
export type TrendingWorkT = z.infer<typeof TrendingWork>;

// /works/{olid}/editions.json returns the editions tied to a work. Each entry
// may carry isbn_13 / isbn_10 arrays (either, both, or neither may be present).
const EditionEntry = z.object({
  isbn_13: z.array(z.string()).optional(),
  isbn_10: z.array(z.string()).optional(),
  number_of_pages: z.number().int().optional(),
});

export const EditionsResponse = z.object({
  entries: z.array(EditionEntry),
});
export type EditionEntryT = z.infer<typeof EditionEntry>;
