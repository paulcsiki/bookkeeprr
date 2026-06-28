// Reader data layer — ported verbatim from
// docs/design/handoff-2026-06-01/bookkeeprr/project/reader-core.jsx.
// Themes, prose, sample book, chapter helpers, and a localStorage-backed
// reading-progress hook.

import { useCallback, useRef, useState } from 'react';

// ──────────────────────────────────────────────────────────────
// Design tokens — mirror src/app/globals.css. Inline so reader components
// stay self-contained and don't depend on CSS-variable resolution.
// ──────────────────────────────────────────────────────────────
export const T = {
  primary: 'hsl(263 70% 60%)',
  fontDisplay: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
  fontBody: '"Geist", ui-sans-serif, system-ui, sans-serif',
  fontMono: '"Geist Mono", ui-monospace, "JetBrains Mono", monospace',
  tManga: 'oklch(0.72 0.17 18)',
  tNovel: 'oklch(0.78 0.13 220)',
  tComic: 'oklch(0.80 0.16 75)',
  tEbook: 'oklch(0.74 0.14 160)',
  tAudio: 'oklch(0.72 0.16 305)',
} as const;

// ──────────────────────────────────────────────────────────────
// READER THEMES — every value the reader paints with. Chrome derives from the
// same set as the page, so a paper page never floats inside a black bar
// (and vice-versa).
// ──────────────────────────────────────────────────────────────
export interface ReaderTheme {
  key: ReaderThemeKey;
  label: string;
  dark: boolean;
  page: string;
  ink: string;
  inkSoft: string;
  faint: string;
  chrome: string;
  chrome2: string;
  line: string;
  line2: string;
  sel: string;
  accent: string;
  swatch: string;
}

export type ReaderThemeKey = 'paper' | 'sepia' | 'dark' | 'oled';

export const READER_THEMES: Record<ReaderThemeKey, ReaderTheme> = {
  paper: {
    key: 'paper',
    label: 'Paper',
    dark: false,
    page: '#faf7f0',
    ink: 'hsl(38 16% 16%)',
    inkSoft: 'hsl(38 10% 38%)',
    faint: 'hsl(38 8% 62%)',
    chrome: '#f1ede3',
    chrome2: '#efe9dd',
    line: 'hsl(38 14% 84%)',
    line2: 'hsl(38 12% 78%)',
    sel: 'hsl(45 90% 62% / 0.34)',
    accent: T.primary,
    swatch: '#faf7f0',
  },
  sepia: {
    key: 'sepia',
    label: 'Sepia',
    dark: false,
    page: '#f3e7cf',
    ink: 'hsl(28 28% 20%)',
    inkSoft: 'hsl(28 18% 40%)',
    faint: 'hsl(28 16% 60%)',
    chrome: '#ecdcbf',
    chrome2: '#e7d5b4',
    line: 'hsl(33 32% 76%)',
    line2: 'hsl(33 28% 70%)',
    sel: 'hsl(35 80% 55% / 0.34)',
    accent: 'oklch(0.55 0.13 40)',
    swatch: '#f3e7cf',
  },
  dark: {
    key: 'dark',
    label: 'Dark',
    dark: true,
    page: 'hsl(240 8% 12%)',
    ink: 'hsl(40 12% 86%)',
    inkSoft: 'hsl(40 6% 60%)',
    faint: 'hsl(40 5% 42%)',
    chrome: 'hsl(240 9% 9%)',
    chrome2: 'hsl(240 9% 14%)',
    line: 'hsl(240 6% 20%)',
    line2: 'hsl(240 6% 26%)',
    sel: 'hsl(263 70% 60% / 0.32)',
    accent: 'hsl(263 75% 70%)',
    swatch: 'hsl(240 8% 14%)',
  },
  oled: {
    key: 'oled',
    label: 'OLED',
    dark: true,
    page: '#000000',
    ink: 'hsl(0 0% 80%)',
    inkSoft: 'hsl(0 0% 52%)',
    faint: 'hsl(0 0% 34%)',
    chrome: '#060608',
    chrome2: 'hsl(240 8% 8%)',
    line: 'hsl(240 6% 15%)',
    line2: 'hsl(240 6% 22%)',
    sel: 'hsl(263 70% 60% / 0.34)',
    accent: 'hsl(263 80% 72%)',
    swatch: '#000000',
  },
};
export const THEME_ORDER: ReaderThemeKey[] = ['paper', 'sepia', 'dark', 'oled'];

// translucent ink for hairlines / fills derived from the active theme
export function inkA(th: ReaderTheme, a: number): string {
  return th.dark ? `hsl(0 0% 100% / ${a})` : `hsl(38 20% 12% / ${a})`;
}

// ──────────────────────────────────────────────────────────────
// ORIGINAL PROSE — written for this prototype (no copyrighted text).
// ──────────────────────────────────────────────────────────────
export const PROSE_EBOOK = [
  'The relay station hung at the edge of the Kessler shelf like a coin balanced on its rim, and for nine days it had been broadcasting the same four seconds of silence.',
  'Wren had listened to those four seconds more times than she cared to admit. There was a texture to them — not noise exactly, but the absence of a noise that should have been there, the way a room feels wrong the instant a clock you never noticed finally stops.',
  'She pulled herself along the handrail toward the array. Beyond the viewport the shelf fell away into a dark so complete it seemed less like distance and more like a decision the universe had made and declined to explain.',
  '“Talk to me,” she said to the station, the way you might to a stubborn animal. The station, predictably, said nothing. It had been built to listen, not to answer, and after forty years it had grown very good at the first and entirely incapable of the second.',
  'The console woke at her touch. Columns of telemetry scrolled past — temperatures, field strengths, the slow tidal breathing of the solar wind — all of it ordinary, all of it exactly as it should be, which was the part she could not forgive.',
  'Because something out there had reached across eleven light-minutes to send them four seconds of nothing, and had meant it. You did not aim a signal that precisely by accident. Silence, when it is deliberate, is the loudest thing in the sky.',
  'Wren keyed the recorder and let it run. If whatever it was intended to speak again, she would be ready. And if it did not, she would sit with the silence until she understood the shape of the question it was asking.',
];

export interface Chapter {
  i: number;
  title: string;
  start: number;
  pages: number;
  mins?: number;
}
function chapters(list: [string, number?][]): Chapter[] {
  let page = 1;
  return list.map(([title, len], i) => {
    const span = len ?? 8 + ((i * 7) % 11);
    const c: Chapter = { i, title, start: page, pages: span };
    if (len != null) c.mins = len;
    page += span;
    return c;
  });
}

export interface BookData {
  id: string;
  type: 'ebook' | 'novel' | 'manga' | 'comic' | 'audio';
  title: string;
  author: string;
  vol?: string;
  hue: number;
  totalPages: number;
  chapters: Chapter[];
  prose: string[];
}
export const BOOK_EBOOK: BookData = {
  id: 'lantern-of-the-deep',
  type: 'ebook',
  title: 'The Lantern of the Deep',
  author: 'Wren Castellan',
  hue: 158,
  totalPages: 312,
  chapters: chapters([
    ['I. The Kessler Shelf'],
    ['II. Four Seconds'],
    ['III. Deliberate Silence'],
    ['IV. Eleven Light-Minutes'],
    ['V. The Shape of a Question'],
    ['VI. Handshake'],
    ['VII. What Answered'],
  ]),
  prose: PROSE_EBOOK,
};

// pos → chapter index + page/min helpers
export function chapterAt(book: BookData, pos: number): Chapter {
  const target = pos * book.totalPages;
  for (let i = book.chapters.length - 1; i >= 0; i--) {
    const c = book.chapters[i]!;
    if (target >= c.start - 1) return c;
  }
  return book.chapters[0]!;
}
export function pageAt(book: BookData, pos: number): number {
  return Math.max(1, Math.min(book.totalPages, Math.round(pos * book.totalPages) || 1));
}

// ──────────────────────────────────────────────────────────────
// Reading progress — persisted in localStorage so the showcase position
// survives refreshes, exactly like the in-app reader.
// ──────────────────────────────────────────────────────────────
const PROGRESS_KEY = (book: string): string => `bk:read:website:${book}`;
function readProgress(bookId: string): { pos: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY(bookId));
    return raw ? (JSON.parse(raw) as { pos: number }) : null;
  } catch {
    return null;
  }
}
function writeProgress(bookId: string, pos: number, type: BookData['type'], title: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PROGRESS_KEY(bookId),
      JSON.stringify({ pos, type, title, at: Date.now() }),
    );
  } catch {
    // ignore quota errors
  }
}

export function useReadingProgress(
  book: BookData,
  opts: { startPos?: number; pid?: string } = {},
): [number, (p: number) => void, boolean] {
  const key = opts.pid ?? book.id;
  const initRef = useRef<{ pos: number; restarted: boolean } | null>(null);
  if (initRef.current === null) {
    const saved = readProgress(key);
    const finished = !!saved && saved.pos >= 0.999;
    initRef.current = {
      pos: opts.startPos != null ? opts.startPos : finished ? 0 : saved ? saved.pos : 0,
      restarted: !!finished && opts.startPos == null,
    };
  }
  const [pos, setPos] = useState<number>(initRef.current.pos);
  const restartedAtOpen = initRef.current.restarted;

  const commit = useCallback(
    (p: number) => {
      const clamped = Math.max(0, Math.min(1, p));
      setPos(clamped);
      writeProgress(key, clamped, book.type, book.title);
    },
    [key, book.type, book.title],
  );

  return [pos, commit, restartedAtOpen];
}

