'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CONTENT_TYPE_LABEL, Skeleton } from '@bookkeeprr/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SettingsSection } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import {
  render,
  validateTemplate,
  type NamingContext,
  type ContentType as NamingContentType,
} from '@/server/naming/engine';
import { NAMING_KEYS, type NamingKey } from '@/server/naming/defaults';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';
import { apiFetch } from '@/lib/api-fetch';

type Props = { initial: Record<NamingKey, string>; contentType: ContentType };

const CONTENT_TYPE: Record<NamingKey, NamingContentType> = {
  series_folder: 'folder',
  volume_subfolder: 'folder',
  volume: 'volume',
  chapter: 'chapter',
  batch: 'batch',
};

const FIXTURE: NamingContext = {
  series: {
    english: 'Chainsaw Man',
    romaji: 'Chainsaw Man',
    anilistId: 105778,
    year: 2018,
    groupPath: ['Engineering', 'Architecture'],
  },
  release: { group: 'LH', language: 'en' },
  target: { volume: 14, chapter: '142', chapterRange: '001-012' },
  source: { ext: 'cbz' },
};

const FIXTURE_UNGROUPED: NamingContext = {
  ...FIXTURE,
  series: { ...FIXTURE.series, groupPath: [] },
};

function previewFor(
  key: NamingKey,
  template: string,
  fixture: NamingContext = FIXTURE,
): { ok: true; preview: string } | { ok: false; error: string } {
  const v = validateTemplate(template, CONTENT_TYPE[key]);
  if (!v.ok) return { ok: false, error: v.error };
  try {
    const ctx: NamingContext = {
      ...fixture,
      target:
        key === 'volume'
          ? { volume: 14 }
          : key === 'chapter'
            ? { chapter: '142' }
            : key === 'batch'
              ? { chapterRange: '001-012' }
              : {},
    };
    return { ok: true, preview: render(template, ctx) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** True for template keys that produce folder paths (may contain {group_path}). */
const FOLDER_KEYS = new Set<NamingKey>(['series_folder', 'volume_subfolder']);

function templatesEqual(
  a: Record<NamingKey, string>,
  b: Record<NamingKey, string>,
): boolean {
  return NAMING_KEYS.every((key) => a[key] === b[key]);
}

export function NamingForm({ initial, contentType }: Props): React.JSX.Element {
  const router = useRouter();
  // The saved baseline. Reset to current values on a successful save so the
  // form is no longer considered dirty after persisting.
  const [saved, setSaved] = useState<Record<NamingKey, string>>(initial);
  const [values, setValues] = useState<Record<NamingKey, string>>(initial);
  const [isPending, startTransition] = useTransition();
  // The content type the user wants to switch to, pending discard confirmation.
  const [pendingSwitch, setPendingSwitch] = useState<ContentType | null>(null);

  const dirty = useMemo(() => !templatesEqual(values, saved), [values, saved]);

  useUnsavedChanges(dirty);

  const allValid = useMemo(() => {
    for (const key of NAMING_KEYS) {
      if (key === 'volume_subfolder' && values[key] === '') continue;
      if (!previewFor(key, values[key]).ok) return false;
    }
    return true;
  }, [values]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/settings/naming?contentType=${contentType}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templates: values }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      // Re-baseline so the form is clean again.
      setSaved(values);
      toast.success('Saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function navigateTo(next: ContentType): void {
    startTransition(() => {
      router.push(`/settings/naming?contentType=${next}`);
    });
  }

  function handleSelect(next: ContentType): void {
    if (next === contentType) return;
    if (dirty) {
      setPendingSwitch(next);
      return;
    }
    navigateTo(next);
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="space-y-7"
      >
        <SettingsSection
          name="Templates"
          description="Path and filename templates rendered for each release. Live previews validate as you type."
        >
          <div className="space-y-5">
            {/* Content-type selector — picks which type's templates are edited below. */}
            <div className="space-y-2">
              <Label>Content type</Label>
              <RadioGroup
                value={contentType}
                onValueChange={(v) => handleSelect(v as ContentType)}
                className="flex flex-wrap items-center gap-x-5 gap-y-2"
              >
                {CONTENT_TYPES.map((t) => (
                  <label
                    key={t}
                    htmlFor={`ct-${t}`}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <RadioGroupItem id={`ct-${t}`} value={t} />
                    <span>{CONTENT_TYPE_LABEL[t]}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-4">
            {NAMING_KEYS.map((key) => {
              if (isPending) {
                return (
                  <div key={key} className="space-y-2">
                    <Skeleton variant="line" width="40%" height={16} />
                    <Skeleton variant="line" width="100%" height={36} />
                    <Skeleton variant="line" width="60%" height={14} />
                  </div>
                );
              }
              const preview = previewFor(key, values[key]);
              const isFolder = FOLDER_KEYS.has(key);
              const hasGroupPath = values[key].includes('{group_path}');
              const previewUngrouped =
                isFolder && hasGroupPath
                  ? previewFor(key, values[key], FIXTURE_UNGROUPED)
                  : null;
              return (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key} className="font-mono">
                    naming.{contentType}.{key}
                  </Label>
                  <Input
                    id={key}
                    value={values[key]}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    className={preview.ok ? '' : 'border-destructive'}
                  />
                  <div className="text-xs text-muted-foreground">
                    {preview.ok ? (
                      isFolder && hasGroupPath ? (
                        <div className="space-y-0.5">
                          <div>
                            Preview · grouped:{' '}
                            <span className="font-mono text-[var(--color-ok)]">
                              {preview.preview || '(empty)'}
                            </span>
                          </div>
                          {previewUngrouped?.ok && (
                            <div>
                              Preview · ungrouped:{' '}
                              <span className="font-mono">
                                {previewUngrouped.preview || '(empty)'}
                              </span>
                              <span className="text-muted-foreground/60 ml-1">
                                — empty token collapses, no stray slash
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          Preview:{' '}
                          <span className="font-mono">{preview.preview || '(empty)'}</span>
                        </>
                      )
                    ) : (
                      <span className="text-destructive">Error: {preview.error}</span>
                    )}
                  </div>
                </div>
              );
            })}
            <Button type="submit" disabled={!allValid || saveMutation.isPending || isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            </div>

            {/* Token reference */}
            <div className="space-y-3 pt-2">
              <p className="text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground">
                Supported tokens
              </p>
              <div className="flex flex-wrap gap-1.5">
                {/* {group_path} — new token, styled with primary accent */}
                <span className="inline-flex items-baseline gap-1 rounded-full border px-2.5 py-1 font-mono text-[11px]"
                  style={{
                    borderColor: 'oklch(from var(--color-primary) l c h / 0.35)',
                    background: 'color-mix(in oklch, var(--color-primary) 16%, var(--color-card))',
                    color: 'var(--color-primary)',
                  }}
                >
                  {'{group_path}'}
                  <sup className="rounded bg-primary px-1 py-px font-sans text-[8px] font-semibold uppercase tracking-wide text-primary-foreground">
                    new
                  </sup>
                  <span className="text-[10px]" style={{ color: 'var(--color-muted-foreground)' }}>
                    library group folders
                  </span>
                </span>
                {/* Standard tokens */}
                {[
                  ['{series_title}', null],
                  ['{series_year}', null],
                  ['{author}', null],
                  ['{publisher}', null],
                  ['{group}', 'release group'],
                  ['{language}', null],
                  ['{volume}', null],
                  ['{chapter}', null],
                  ['{ext}', null],
                ].map(([tok, caption]) => (
                  <span
                    key={tok}
                    className="inline-flex items-baseline gap-1 rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
                  >
                    {tok}
                    {caption && (
                      <span className="text-[10px] opacity-60">{caption}</span>
                    )}
                  </span>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-mono text-foreground">{'{group_path}'}</span> renders the
                series&apos; library group as a folder path (e.g.{' '}
                <span className="font-mono">Engineering/Architecture</span>). Nested groups become
                nested directories, and it is empty for ungrouped series — the surrounding slash
                collapses automatically, leaving no stray separator. This token is distinct from{' '}
                <span className="font-mono text-foreground">{'{group}'}</span>, which is the release
                group. Moving a series between groups re-routes its folder on the next rename.
              </p>
            </div>
          </div>
        </SettingsSection>
      </form>

      <AlertDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved template changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ve edited templates for {CONTENT_TYPE_LABEL[contentType]} but haven&apos;t
              saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const next = pendingSwitch;
                setPendingSwitch(null);
                if (next) navigateTo(next);
              }}
            >
              Discard & switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
