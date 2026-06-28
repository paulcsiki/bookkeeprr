'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileUp, Magnet, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-fetch';

// .torrent files are metadata-only; the server caps uploads at 2 MiB too.
const MAX_TORRENT_BYTES = 2 * 1024 * 1024;

/**
 * Client-side preview of a magnet's btih info-hash (hex or base32 form). The
 * server re-validates authoritatively — this only powers the mono preview row.
 */
function previewInfohash(magnet: string): string | null {
  const m = /urn:btih:([0-9a-fA-F]{40}|[A-Z2-7]{32})/.exec(magnet);
  return m ? m[1]!.toLowerCase() : null;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

type Props = {
  seriesId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ManualGrabDialog({ seriesId, open, onOpenChange }: Props): React.JSX.Element {
  const [magnet, setMagnet] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const infohash = magnet.trim() ? previewInfohash(magnet.trim()) : null;
  const canSubmit = file !== null || infohash !== null;

  function reset(): void {
    setMagnet('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const submit = useMutation({
    mutationFn: async () => {
      let resp: Response;
      if (file) {
        const fd = new FormData();
        fd.append('torrent', file);
        resp = await apiFetch(`/api/series/${seriesId}/manual-grab`, {
          method: 'POST',
          body: fd,
        });
      } else {
        resp = await apiFetch(`/api/series/${seriesId}/manual-grab`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ magnet: magnet.trim() }),
        });
      }
      const body = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) throw new Error(body.error ?? `HTTP ${resp.status}`);
      return body;
    },
    onSuccess: () => {
      toast.success('Added to downloads');
      // Reflect the new download in the Releases tab and Activity views.
      void qc.invalidateQueries({ queryKey: ['downloads'] });
      void qc.invalidateQueries({ queryKey: ['series-releases', seriesId] });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function onFilePicked(picked: File | null): void {
    if (picked && picked.size > MAX_TORRENT_BYTES) {
      toast.error('Torrent file too large (max 2 MiB)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(picked);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add download manually</DialogTitle>
          <DialogDescription>
            Paste a magnet link or upload a .torrent file. It downloads and imports into this
            series through the normal pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Magnet link */}
          <div className="space-y-1.5">
            <Label htmlFor="manual-grab-magnet" className="flex items-center gap-1.5">
              <Magnet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Magnet link
            </Label>
            <Input
              id="manual-grab-magnet"
              type="text"
              placeholder="magnet:?xt=urn:btih:…"
              value={magnet}
              disabled={file !== null}
              onChange={(e) => setMagnet(e.target.value)}
              className="font-mono text-xs"
            />
            {magnet.trim() !== '' && (
              <p className="font-mono text-[11px] text-muted-foreground">
                {infohash ? (
                  <>infohash {infohash}</>
                ) : (
                  <span className="text-destructive">no btih info-hash found</span>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* .torrent file */}
          <div className="space-y-1.5">
            <Label htmlFor="manual-grab-torrent" className="flex items-center gap-1.5">
              <FileUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Torrent file
            </Label>
            <Input
              id="manual-grab-torrent"
              ref={fileInputRef}
              type="file"
              accept=".torrent,application/x-bittorrent"
              disabled={magnet.trim() !== ''}
              onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <span className="truncate">{file.name}</span>
                <span>{formatSize(file.size)}</span>
                <button
                  type="button"
                  className="rounded p-0.5 transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => onFilePicked(null)}
                  aria-label="Clear selected file"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? 'Adding…' : 'Add to downloads'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
