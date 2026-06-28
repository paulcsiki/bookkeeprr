'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';
import { CONTENT_TYPE_LABEL } from '@bookkeeprr/ui';
import type {
  ContentTypePaths,
  TorrentCleanup,
  ImageCache,
} from '@/server/db/settings/library';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSection } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { apiFetch } from '@/lib/api-fetch';

export type StorageFallbacks = Record<
  ContentType,
  { libraryRoot: string; qbtCategory: string }
>;

const CLEANUP_MODES: { value: TorrentCleanup['mode']; label: string }[] = [
  { value: 'never', label: 'Never (keep seeding)' },
  { value: 'after_import', label: 'After import' },
  { value: 'after_ratio', label: 'After seed ratio' },
  { value: 'after_seed_time', label: 'After seed time' },
];

export function StorageForm({
  initialPaths,
  initialCleanup,
  initialImageCache,
  imageCacheDirDefault,
  fallbacks,
}: {
  initialPaths: ContentTypePaths;
  initialCleanup: TorrentCleanup;
  initialImageCache: ImageCache;
  imageCacheDirDefault: string;
  fallbacks: StorageFallbacks;
}): React.JSX.Element {
  const [paths, setPaths] = useState<ContentTypePaths>(initialPaths);
  const [cleanup, setCleanup] = useState<TorrentCleanup>(initialCleanup);
  const [imageCache, setImageCache] = useState<ImageCache>(initialImageCache);
  const [savedPaths, setSavedPaths] = useState<ContentTypePaths>(initialPaths);
  const [savedCleanup, setSavedCleanup] = useState<TorrentCleanup>(initialCleanup);
  const [savedImageCache, setSavedImageCache] = useState<ImageCache>(initialImageCache);
  const [pending, startTransition] = useTransition();

  const dirty =
    JSON.stringify(paths) !== JSON.stringify(savedPaths) ||
    JSON.stringify(cleanup) !== JSON.stringify(savedCleanup) ||
    JSON.stringify(imageCache) !== JSON.stringify(savedImageCache);
  useUnsavedChanges(dirty);

  function setPathField(
    type: ContentType,
    field: 'libraryRoot' | 'qbtCategory',
    value: string,
  ): void {
    setPaths((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
  }

  // Light client-side validation before letting the server be the source of truth.
  const ratioInvalid = cleanup.mode === 'after_ratio' && !(Number(cleanup.ratio) > 0);
  const seedMinutesInvalid =
    cleanup.mode === 'after_seed_time' && !(Number(cleanup.seedMinutes) > 0);
  const canSave = dirty && !ratioInvalid && !seedMinutesInvalid;

  function save(): void {
    startTransition(async () => {
      // Normalize the cleanup payload to match the zod schema (drop irrelevant
      // optional fields for the active mode so .strict() never rejects).
      const cleanupBody: TorrentCleanup = {
        mode: cleanup.mode,
        deleteFiles: cleanup.deleteFiles,
        ...(cleanup.mode === 'after_ratio' ? { ratio: Number(cleanup.ratio) } : {}),
        ...(cleanup.mode === 'after_seed_time'
          ? { seedMinutes: Number(cleanup.seedMinutes) }
          : {}),
      };
      try {
        const r = await apiFetch('/api/settings/storage', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contentTypePaths: paths,
            torrentCleanup: cleanupBody,
            imageCache,
          }),
        });
        if (!r.ok) {
          const text = await r.text();
          toast.error(`Save failed (${r.status}): ${text}`);
          return;
        }
        setSavedPaths(paths);
        setSavedCleanup(cleanupBody);
        setCleanup(cleanupBody);
        setSavedImageCache(imageCache);
        toast.success('Storage settings saved');
      } catch (err) {
        toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  return (
    <div className="space-y-7">
      <SettingsSection
        name="Library paths"
        description="Each content type can live on its own absolute library root. Leave blank to use the default shown as the placeholder."
      >
        <div className="space-y-5">
          {CONTENT_TYPES.map((type) => (
            <div key={type} className="space-y-3">
              <div className="font-display text-[14px] font-semibold tracking-[-0.01em]">
                {CONTENT_TYPE_LABEL[type]}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field htmlFor={`path-${type}`} label="Library path">
                  <Input
                    id={`path-${type}`}
                    className="font-mono"
                    placeholder={fallbacks[type].libraryRoot}
                    value={paths[type].libraryRoot}
                    onChange={(e) => setPathField(type, 'libraryRoot', e.currentTarget.value)}
                  />
                </Field>
                <Field htmlFor={`cat-${type}`} label="qBittorrent category">
                  <Input
                    id={`cat-${type}`}
                    className="font-mono"
                    placeholder={fallbacks[type].qbtCategory}
                    value={paths[type].qbtCategory}
                    onChange={(e) => setPathField(type, 'qbtCategory', e.currentTarget.value)}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        name="Torrent cleanup"
        description="Opt-in removal of torrents from qBittorrent after import or once a seed threshold is met."
      >
        <div className="space-y-3">
          <Field htmlFor="cleanup-mode" label="Cleanup policy">
            <Select
              value={cleanup.mode}
              onValueChange={(v) =>
                setCleanup((prev) => ({ ...prev, mode: v as TorrentCleanup['mode'] }))
              }
            >
              <SelectTrigger id="cleanup-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLEANUP_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {cleanup.mode === 'after_ratio' && (
            <Field
              htmlFor="cleanup-ratio"
              label="Seed ratio"
              error={ratioInvalid ? 'Enter a ratio greater than 0.' : undefined}
            >
              <Input
                id="cleanup-ratio"
                type="number"
                min={0}
                step="0.1"
                className="font-mono"
                value={cleanup.ratio ?? ''}
                onChange={(e) =>
                  setCleanup((prev) => ({
                    ...prev,
                    ratio: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
                  }))
                }
              />
            </Field>
          )}

          {cleanup.mode === 'after_seed_time' && (
            <Field
              htmlFor="cleanup-seed"
              label="Seed time (minutes)"
              error={seedMinutesInvalid ? 'Enter a positive number of minutes.' : undefined}
            >
              <Input
                id="cleanup-seed"
                type="number"
                min={1}
                step="1"
                className="font-mono"
                value={cleanup.seedMinutes ?? ''}
                onChange={(e) =>
                  setCleanup((prev) => ({
                    ...prev,
                    seedMinutes:
                      e.currentTarget.value === ''
                        ? undefined
                        : Number(e.currentTarget.value),
                  }))
                }
              />
            </Field>
          )}

          <div className="flex items-center justify-between gap-6 pt-1">
            <Label htmlFor="cleanup-delete" className="text-[13.5px] font-medium">
              Also delete torrent files
            </Label>
            <Switch
              id="cleanup-delete"
              checked={cleanup.deleteFiles}
              onCheckedChange={(checked) =>
                setCleanup((prev) => ({ ...prev, deleteFiles: checked }))
              }
            />
          </div>

          <p className="max-w-[460px] text-[12px] leading-snug text-muted-foreground">
            Deleting the torrent files is safe for your library — imported files are a separate
            hardlink or copy. Note: if a content type&apos;s library is on a different drive than
            the download directory, import falls back to a copy (extra space), which this cleanup
            then reclaims.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        name="Image cache"
        description="Opt-in server-side cache for library cover art. When on, covers are fetched once and served from disk thereafter, then purged when their item is removed."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-6">
            <Label htmlFor="imgcache-enabled" className="text-[13.5px] font-medium">
              Cache library covers
            </Label>
            <Switch
              id="imgcache-enabled"
              checked={imageCache.enabled}
              onCheckedChange={(checked) =>
                setImageCache((prev) => ({ ...prev, enabled: checked }))
              }
            />
          </div>

          <Field htmlFor="imgcache-dir" label="Cache directory">
            <Input
              id="imgcache-dir"
              className="font-mono"
              placeholder={imageCacheDirDefault}
              value={imageCache.dir}
              onChange={(e) =>
                setImageCache((prev) => ({ ...prev, dir: e.currentTarget.value }))
              }
            />
          </Field>

          <p className="max-w-[460px] text-[12px] leading-snug text-muted-foreground">
            Leave the directory blank to use the default shown as the placeholder. Only library
            covers are cached — Discover and search covers always load direct.
          </p>
        </div>
      </SettingsSection>

      <div>
        <Button onClick={save} disabled={!canSave || pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
