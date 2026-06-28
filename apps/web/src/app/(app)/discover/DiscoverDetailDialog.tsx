'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ContentTypePill } from '@bookkeeprr/ui';
import { Button } from '@/components/ui/button';
import { Cover } from '@/components/Cover';
import { ConfigureSheet } from '@/components/add/ConfigureSheet';
import { useAddInfra } from '@/components/add/useAddInfra';
import type { DiscoverResult } from '@/app/api/discover/search/route';
import type { DiscoverDetail } from '@/app/api/discover/detail/route';
import { anilistMangaUrl, mangadexMangaUrl } from '@/lib/external-links';
import { cn } from '@/lib/utils';

type Props = {
  result: DiscoverResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Sources = NonNullable<DiscoverResult['sources']>;

/** External source links available for a result, in display order. */
function sourceLinks(s: Sources | undefined): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  if (s?.anilist != null) links.push({ label: 'AniList', href: anilistMangaUrl(s.anilist) });
  if (s?.mangadex != null)
    links.push({ label: 'MangaDex', href: mangadexMangaUrl(s.mangadex) });
  if (s?.openlibrary != null)
    links.push({ label: 'OpenLibrary', href: `https://openlibrary.org/works/${s.openlibrary}` });
  if (s?.mal != null)
    links.push({ label: 'MyAnimeList', href: `https://myanimelist.net/manga/${s.mal}` });
  return links;
}

/** Compact mono id line from cross-linked provider ids. */
function sourceIds(s: Sources | undefined): string {
  const trunc = (v: string): string => (v.length > 10 ? `${v.slice(0, 6)}…` : v);
  const parts: string[] = [];
  if (s?.anilist != null) parts.push(`anilist:${s.anilist}`);
  if (s?.mal != null) parts.push(`mal:${s.mal}`);
  if (s?.mangadex != null) parts.push(`mdex:${trunc(s.mangadex)}`);
  if (s?.comicvine != null) parts.push(`comicvine:${s.comicvine}`);
  if (s?.openlibrary != null) parts.push(`olid:${trunc(s.openlibrary)}`);
  if (s?.audnex != null) parts.push(`asin:${trunc(s.audnex)}`);
  return parts.join(' · ');
}

export function DiscoverDetailDialog({ result, open, onOpenChange }: Props): React.JSX.Element {
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const { addingKey, sheetTarget, setSheetTarget, isInLib, openConfigure, quickAdd } = useAddInfra();

  // Best-effort extended detail (description + counts) for the primary source.
  const detailQuery = useQuery<DiscoverDetail>({
    queryKey: [
      'discover-detail',
      result?.contentType,
      result?.source,
      result?.sourceId,
      result?.title,
      result?.sources?.mangadex,
    ],
    enabled: open && result != null,
    queryFn: async () => {
      const qs = new URLSearchParams({
        contentType: result!.contentType,
        source: result!.source,
        id: result!.sourceId,
      });
      // Title lets the endpoint lazily resolve a MangaDex match for browse tiles
      // that carry no pre-resolved cross-link.
      if (result!.title) qs.set('title', result!.title);
      // Cross-linked MangaDex id powers the chapter-count fallback for ongoing
      // webtoons/manhwa whose AniList/MAL chapter count is null.
      if (result!.sources?.mangadex) qs.set('mdexId', result!.sources.mangadex);
      const r = await fetch(`/api/discover/detail?${qs.toString()}`);
      if (!r.ok) return {};
      return (await r.json()) as DiscoverDetail;
    },
    staleTime: 5 * 60_000,
  });

  // Reset the configure sheet when the dialog closes.
  useEffect(() => {
    if (!open) {
      setSheetTarget(null);
      setSplitMenuOpen(false);
    }
  }, [open, setSheetTarget]);

  // Effective sources: the result's own cross-links, plus a MangaDex id the
  // detail endpoint resolved lazily by title (browse tiles). Never mutate
  // `result` — compute a merged view so the MangaDex link/id appears once the
  // lazy resolve lands, without disturbing the search-result path.
  const effectiveSources = useMemo<Sources | undefined>(() => {
    if (result == null) return undefined;
    const resolvedMdex = detailQuery.data?.mangadexId ?? undefined;
    if (resolvedMdex == null || result.sources?.mangadex != null) return result.sources;
    return { ...result.sources, mangadex: resolvedMdex };
  }, [result, detailQuery.data?.mangadexId]);

  const links = useMemo(() => sourceLinks(effectiveSources), [effectiveSources]);
  const ids = useMemo(() => sourceIds(effectiveSources), [effectiveSources]);

  if (result == null) {
    return <DialogPrimitive.Root open={false} onOpenChange={onOpenChange} />;
  }

  const inLib = isInLib(result);
  const adding = addingKey === `${result.contentType}::${result.sourceId}`;
  const detail = detailQuery.data;
  // AniList descriptions arrive as HTML; strip tags for a plain-text synopsis.
  const description = detail?.description
    ? detail.description.replace(/<[^>]*>/g, '').trim()
    : null;

  const facts: string[] = [];
  if (result.author) facts.push(result.author);
  if (result.year != null) facts.push(String(result.year));
  if (detail?.totalVolumes != null) facts.push(`${detail.totalVolumes} volumes`);
  if (detail?.totalChapters != null) facts.push(`${detail.totalChapters} chapters`);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => {
            if (splitMenuOpen) e.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">{result.title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Details for {result.title}
          </DialogPrimitive.Description>

          {sheetTarget != null ? (
            <ConfigureSheet target={sheetTarget} onClose={() => setSheetTarget(null)} />
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Header — mirrors the library SeriesDetail header. */}
            <div className="flex gap-5 p-5">
              <div className="relative aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-lg border border-border">
                <Cover
                  className="absolute inset-0"
                  src={result.coverUrl}
                  contentType={result.contentType}
                  title={result.title}
                  alt={result.title}
                  loading="eager"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start gap-2">
                  <h2 className="font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
                    {result.title}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ContentTypePill type={result.contentType} />
                  {inLib ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      <Check className="h-3 w-3 text-ok" strokeWidth={2.4} />
                      In library
                    </span>
                  ) : null}
                </div>
                {facts.length > 0 ? (
                  <div className="font-mono text-[11.5px] text-muted-foreground">
                    {facts.join(' · ')}
                  </div>
                ) : null}
                {result.detail ? (
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
                    {result.detail}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 pt-0.5">
                  {links.map((l) => (
                    <a
                      key={l.label}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-medium text-primary hover:underline"
                    >
                      {l.label} ↗
                    </a>
                  ))}
                </div>
                {ids ? (
                  <div className="truncate font-mono text-[10px] text-muted-foreground/60">{ids}</div>
                ) : null}
              </div>
            </div>

            {/* Synopsis */}
            {description ? (
              <div className="px-5 pb-5">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Synopsis
                </div>
                <p className="text-[13.5px] leading-relaxed text-foreground/90">{description}</p>
              </div>
            ) : detailQuery.isLoading ? (
              <div className="px-5 pb-5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-muted" />
              </div>
            ) : null}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {inLib ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                <Check className="h-4 w-4 text-ok" strokeWidth={2.4} />
                In library
              </span>
            ) : (
              <SplitAddButton
                adding={adding}
                onAdd={() => void quickAdd(result)}
                onConfigure={() => openConfigure(result)}
                onMenuOpenChange={setSplitMenuOpen}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Split "Add" button: primary action quick-adds with defaults; the caret opens
 * a portaled menu exposing "Add to library" and "Add & configure". Mirrors the
 * AddDialog's split button so both surfaces behave identically.
 */
function SplitAddButton({
  adding,
  onAdd,
  onConfigure,
  onMenuOpenChange,
}: {
  adding: boolean;
  onAdd: () => void;
  onConfigure: () => void;
  onMenuOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    onMenuOpenChange(menuOpen);
  }, [menuOpen, onMenuOpenChange]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (): void => setMenuOpen(false);
    function onPointerDown(e: PointerEvent): void {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (document.getElementById('discover-detail-add-menu')?.contains(t)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  function toggle(): void {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.top - 4, right: window.innerWidth - r.right });
    setMenuOpen((v) => !v);
  }

  const item =
    'flex w-full items-center rounded-md px-2.5 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted';

  return (
    <div ref={wrapRef} className="flex items-center">
      <Button size="sm" disabled={adding} onClick={onAdd} className="rounded-r-none">
        {adding ? 'Adding…' : 'Add'}
      </Button>
      <Button
        size="sm"
        disabled={adding}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="More add options"
        className="rounded-l-none border-l border-primary-foreground/25 px-1.5"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', menuOpen && 'rotate-180')} />
      </Button>
      {menuOpen && pos
        ? createPortal(
            <div
              id="discover-detail-add-menu"
              role="menu"
              style={{
                position: 'fixed',
                top: pos.top,
                right: pos.right,
                transform: 'translateY(-100%)',
                pointerEvents: 'auto',
              }}
              className="z-[60] min-w-[176px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setMenuOpen(false);
                  onAdd();
                }}
              >
                Add to library
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setMenuOpen(false);
                  onConfigure();
                }}
              >
                Add &amp; configure
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
