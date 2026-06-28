'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, RefreshCw, Pencil } from 'lucide-react';
import { ContentTypePill } from '@/components/ContentTypePill';
import { Cover } from '@/components/Cover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBreadcrumbLabel } from '@/components/shell/BreadcrumbLabels';
import { useAddDialog } from '@/components/add/AddDialogProvider';
import { apiFetch } from '@/lib/api-fetch';
import { cleanDescription } from '@/lib/format';
import type { BookSeriesEntry } from '@bookkeeprr/types';
import type { ContentType } from '@bookkeeprr/types/pure';

type Props = {
  id: number;
  name: string;
  contentType: ContentType;
  coverUrl: string | null | undefined;
  totalBooks: number | null;
  memberCount: number;
  description: string | null;
  books: BookSeriesEntry[];
  isAdmin?: boolean;
  cacheEnabled?: boolean;
};

type EditBody = {
  name?: string;
  description?: string | null;
  coverUrl?: string | null;
};

// ── Edit dialog ────────────────────────────────────────────────────────────────

function EditDialog({
  open,
  onOpenChange,
  id,
  initialName,
  initialDescription,
  initialCoverUrl,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  id: number;
  initialName: string;
  initialDescription: string | null;
  initialCoverUrl: string | null | undefined;
  onSaved: (updated: { name: string; description: string | null; coverUrl: string | null }) => void;
}): React.JSX.Element {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl ?? '');

  const mutation = useMutation({
    mutationFn: async () => {
      const body: EditBody = {};
      if (name.trim() !== initialName) body.name = name.trim();
      if ((description.trim() || null) !== (initialDescription || null)) {
        body.description = description.trim() || null;
      }
      if ((coverUrl.trim() || null) !== (initialCoverUrl ?? null)) {
        body.coverUrl = coverUrl.trim() || null;
      }
      if (Object.keys(body).length === 0) return { name, description: description || null, coverUrl: coverUrl || null };
      const r = await apiFetch(`/api/book-series/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(data.error ?? data.message ?? `HTTP ${r.status}`);
      }
      return { name: name.trim(), description: description.trim() || null, coverUrl: coverUrl.trim() || null };
    },
    onSuccess: (result) => {
      toast.success('Series updated');
      onSaved(result);
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Edit series</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="bs-name">Name</Label>
            <Input
              id="bs-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Series name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bs-description">Description</Label>
            <textarea
              id="bs-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bs-cover">Cover URL</Label>
            <Input
              id="bs-cover"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || name.trim().length === 0}
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Book card ──────────────────────────────────────────────────────────────────

function BookCard({
  book,
  bookSeriesId,
  contentType,
}: {
  book: BookSeriesEntry;
  bookSeriesId: number;
  contentType: ContentType;
}): React.JSX.Element {
  const { open: openAddDialog } = useAddDialog();

  const posLabel = book.position != null ? `#${book.position}` : null;

  if (book.owned && book.seriesId != null) {
    return (
      <Link
        href={`/library/${book.seriesId}`}
        data-testid={`owned-book-${book.seriesId}`}
        className="group flex flex-col gap-2 rounded-md border border-border bg-card p-2 hover:border-primary transition-colors"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded">
          <Cover
            className="absolute inset-0"
            src={book.coverUrl}
            contentType={contentType}
            title={book.title}
            alt={book.title}
            loading="lazy"
          />
        </div>
        <div className="space-y-0.5 min-w-0">
          {posLabel && (
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {posLabel}
            </p>
          )}
          <p className="text-sm font-medium leading-tight truncate group-hover:text-primary transition-colors">
            {book.title}
          </p>
        </div>
      </Link>
    );
  }

  // Missing book
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-2 opacity-50">
      <div className="relative aspect-[2/3] overflow-hidden rounded">
        <Cover
          className="absolute inset-0"
          src={book.coverUrl}
          contentType={contentType}
          title={book.title}
          alt={book.title}
          loading="lazy"
        />
      </div>
      <div className="space-y-0.5 min-w-0">
        {posLabel && (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {posLabel}
          </p>
        )}
        <p className="text-sm font-medium leading-tight truncate">{book.title}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        data-testid="missing-book-add"
        data-book-title={book.title}
        data-book-series-id={bookSeriesId}
        onClick={() => openAddDialog({ query: book.title, contentType })}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add
      </Button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BookSeriesDetailView({
  id,
  name,
  contentType,
  coverUrl,
  totalBooks,
  description,
  books,
  isAdmin = false,
}: Props): React.JSX.Element {
  // Local state for optimistic edits
  const [localName, setLocalName] = useState(name);
  const [localDescription, setLocalDescription] = useState(description);
  const [localCoverUrl, setLocalCoverUrl] = useState(coverUrl);
  const [editOpen, setEditOpen] = useState(false);

  const qc = useQueryClient();
  const router = useRouter();

  // Register breadcrumb label so top nav shows series name instead of raw id.
  useBreadcrumbLabel(`/library/series/${id}`, localName);

  const ownedCount = books.filter((b) => b.owned).length;
  const totalCount = books.length;

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/book-series/${id}/refresh`, { method: 'POST' });
      if (!r.ok && r.status !== 202) {
        const data = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(data.error ?? data.message ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      toast.success('Refresh queued');
      // Invalidate any queries that might be affected
      void qc.invalidateQueries({ queryKey: ['book-series', id] });
      router.refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const desc = cleanDescription(localDescription);

  return (
    <div className="space-y-8" data-testid="book-series-page">
      {/* ── Header ── */}
      <header className="flex gap-6">
        <div className="relative w-36 aspect-[2/3] flex-shrink-0 overflow-hidden rounded-md border border-border">
          <Cover
            className="absolute inset-0"
            src={localCoverUrl}
            contentType={contentType}
            title={localName}
            alt={localName}
            loading="eager"
          />
        </div>

        <div className="flex flex-col gap-3 flex-1 min-w-0">
          {/* Eyebrow */}
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Book series
          </p>

          {/* Title */}
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] leading-tight">
            {localName}
          </h1>

          {/* Content type pill + counts */}
          <div className="flex flex-wrap items-center gap-3">
            <ContentTypePill type={contentType} />
            <span className="font-mono text-sm text-muted-foreground">
              {totalBooks != null ? totalBooks : totalCount} BOOKS{' '}
              <span className="text-foreground">·</span>{' '}
              {ownedCount} OWNED
            </span>
          </div>

          {/* Description */}
          {desc && (
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-4">
              {desc}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 mt-auto pt-2">
            {isAdmin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                  Refresh series
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/library?type=${contentType}`}>
                    Manage titles
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Book grid ── */}
      <section>
        <h2 className="font-display text-lg font-semibold mb-4">
          {ownedCount === 0 ? 'Books' : `${ownedCount} of ${totalCount} owned`}
        </h2>

        {books.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No books found in this series yet.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
            {books.map((book, i) => (
              <BookCard
                key={book.seriesId != null ? `owned-${book.seriesId}` : `entry-${i}`}
                book={book}
                bookSeriesId={id}
                contentType={contentType}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Edit dialog ── */}
      {isAdmin && (
        <EditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          id={id}
          initialName={localName}
          initialDescription={localDescription}
          initialCoverUrl={localCoverUrl}
          onSaved={(updated) => {
            setLocalName(updated.name);
            setLocalDescription(updated.description);
            setLocalCoverUrl(updated.coverUrl);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
