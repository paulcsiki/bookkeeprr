'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shell/PageHeader';
import type { IndexerView } from './IndexersList';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';

type Props = { mode: 'create' } | { mode: 'edit'; id: number };

type NyaaConfigForm = {
  kind: 'nyaa';
  queryTemplate: string;
  contentTypes: ContentType[];
  categoryByContentType: Partial<Record<ContentType, '3_1' | '3_3'>>;
  pollIntervalSeconds: number;
};

type FilelistConfigForm = {
  kind: 'filelist';
  queryTemplate: string;
  contentTypes: ContentType[];
  categoryByContentType: Partial<Record<ContentType, number>>;
  username: string;
  passkey: string;
  pollIntervalSeconds: number;
};

type TorznabConfigForm = {
  kind: 'torznab';
  queryTemplate: string;
  contentTypes: ContentType[];
  categoryByContentType: Partial<Record<ContentType, string>>;
  apiKey: string;
  pollIntervalSeconds: number;
  prowlarrIndexerId?: number;
};

type MamConfigForm = {
  kind: 'mam';
  queryTemplate: string;
  contentTypes: ContentType[];
  categoryByContentType: Partial<Record<ContentType, number>>;
  mamId: string;
  proxyUrl: string;
  searchIn: string[];
  pollIntervalSeconds: number;
};

type ConfigForm = NyaaConfigForm | FilelistConfigForm | TorznabConfigForm | MamConfigForm;

const TORZNAB_DEFAULT_CATEGORIES: Record<ContentType, string> = {
  manga: '7030',
  comic: '7030',
  light_novel: '7020',
  ebook: '7020',
  audiobook: '3030',
};

function defaultNyaa(): NyaaConfigForm {
  return {
    kind: 'nyaa',
    queryTemplate: '{title} {extra}',
    contentTypes: ['manga', 'comic'],
    categoryByContentType: { manga: '3_1', comic: '3_1' },
    pollIntervalSeconds: 900,
  };
}

function defaultFilelist(): FilelistConfigForm {
  return {
    kind: 'filelist',
    queryTemplate: '{title} {extra}',
    contentTypes: [],
    categoryByContentType: {},
    username: '',
    passkey: '',
    pollIntervalSeconds: 900,
  };
}

function defaultTorznab(): TorznabConfigForm {
  return {
    kind: 'torznab',
    queryTemplate: '{title} {extra}',
    contentTypes: [],
    categoryByContentType: {},
    apiKey: '',
    pollIntervalSeconds: 900,
  };
}

function defaultMam(): MamConfigForm {
  return {
    kind: 'mam',
    queryTemplate: '{title}',
    contentTypes: ['ebook', 'audiobook'],
    categoryByContentType: { ebook: 14, audiobook: 13 },
    mamId: '',
    proxyUrl: '',
    searchIn: ['title'],
    pollIntervalSeconds: 900,
  };
}

function parseCfg(raw: string, kind: string): ConfigForm {
  let obj: Record<string, unknown> = {};
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // empty
  }
  if (kind === 'torznab') {
    return {
      kind: 'torznab',
      queryTemplate: (obj.queryTemplate as string) ?? '{title} {extra}',
      contentTypes: (obj.contentTypes as ContentType[]) ?? [],
      categoryByContentType:
        (obj.categoryByContentType as Partial<Record<ContentType, string>>) ?? {},
      apiKey: '',
      pollIntervalSeconds: (obj.pollIntervalSeconds as number) ?? 900,
      ...(typeof obj.prowlarrIndexerId === 'number'
        ? { prowlarrIndexerId: obj.prowlarrIndexerId }
        : {}),
    };
  }
  if (kind === 'filelist') {
    return {
      kind: 'filelist',
      queryTemplate: (obj.queryTemplate as string) ?? '{title} {extra}',
      contentTypes: (obj.contentTypes as ContentType[]) ?? [],
      categoryByContentType:
        (obj.categoryByContentType as Partial<Record<ContentType, number>>) ?? {},
      username: (obj.username as string) ?? '',
      passkey: '',
      pollIntervalSeconds: (obj.pollIntervalSeconds as number) ?? 900,
    };
  }
  if (kind === 'mam') {
    return {
      kind: 'mam',
      queryTemplate: (obj.queryTemplate as string) ?? '{title}',
      contentTypes: (obj.contentTypes as ContentType[]) ?? [],
      categoryByContentType:
        (obj.categoryByContentType as Partial<Record<ContentType, number>>) ?? {},
      mamId: '',
      proxyUrl: (obj.proxyUrl as string) ?? '',
      searchIn: (obj.searchIn as string[]) ?? ['title'],
      pollIntervalSeconds: (obj.pollIntervalSeconds as number) ?? 900,
    };
  }
  return {
    kind: 'nyaa',
    queryTemplate: (obj.queryTemplate as string) ?? '{title} {extra}',
    contentTypes: (obj.contentTypes as ContentType[]) ?? ['manga', 'comic'],
    categoryByContentType: (obj.categoryByContentType as Partial<
      Record<ContentType, '3_1' | '3_3'>
    >) ?? { manga: '3_1', comic: '3_1' },
    pollIntervalSeconds: (obj.pollIntervalSeconds as number) ?? 900,
  };
}

/**
 * Multi-select for Torznab categories: shows the chosen categories as removable
 * chips and a dropdown to add from the indexer's discovered categories. Stores
 * the selection as a comma-separated id list (the torznab config format).
 */
function TorznabCategoryPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (csv: string) => void;
}): React.JSX.Element {
  const selected = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const labelById = new Map(options.map((o) => [o.id, o.label]));
  const available = options.filter((o) => !selected.includes(o.id));
  const add = (id: string): void => {
    if (!selected.includes(id)) onChange([...selected, id].join(','));
  };
  const remove = (id: string): void => onChange(selected.filter((s) => s !== id).join(','));

  return (
    <div className="flex-1 space-y-1.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs"
            >
              <span className="font-mono">{id}</span>
              {labelById.get(id) && <span className="text-muted-foreground">{labelById.get(id)}</span>}
              <button
                type="button"
                onClick={() => remove(id)}
                aria-label={`Remove category ${id}`}
                className="ml-0.5 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <Select value="" onValueChange={add}>
        <SelectTrigger>
          <SelectValue placeholder={selected.length ? 'Add another category…' : 'Select categories…'} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {available.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">All categories added</div>
          ) : (
            available.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                <span className="font-mono">{o.id}</span> — {o.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export function IndexerForm(props: Props): React.JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const isCreate = props.mode === 'create';

  // Edit mode: source the indexer from the same query IndexersList uses.
  // Mirror IndexersList's queryKey AND fetcher exactly: queryKey ['indexers'],
  // GET /api/indexers, returning the unwrapped IndexerView[] (not the
  // { indexers } envelope) so a warm cache populated by IndexersList — the
  // common list→edit navigation path — has the shape this read expects.
  const listQ = useQuery<IndexerView[]>({
    queryKey: ['indexers'],
    queryFn: async () => {
      const r = await apiFetch('/api/indexers');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { indexers: IndexerView[] };
      return body.indexers;
    },
    enabled: !isCreate,
  });
  const indexer = isCreate
    ? null
    : (listQ.data?.find((i) => i.id === props.id) ?? null);

  if (!isCreate && listQ.isLoading)
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  // Distinguish a failed fetch from a genuinely-missing indexer (parity with
  // the mobile EditIndexer screen): a network error must not read as "not found".
  if (!isCreate && listQ.isError && indexer === null)
    return <p className="text-sm text-muted-foreground">Could not load indexers.</p>;
  if (!isCreate && indexer === null)
    return <p className="text-sm text-muted-foreground">Indexer not found.</p>;

  // Mount the field state (which is seeded from `indexer`) only once the
  // indexer is resolved (or in create mode), so the lazy useState initializer
  // sees the real config.
  return <IndexerFormBody isCreate={isCreate} indexer={indexer} router={router} qc={qc} />;
}

function IndexerFormBody({
  isCreate,
  indexer,
  router,
  qc,
}: {
  isCreate: boolean;
  indexer: IndexerView | null;
  router: ReturnType<typeof useRouter>;
  qc: ReturnType<typeof useQueryClient>;
}): React.JSX.Element {
  function done(): void {
    void qc.invalidateQueries({ queryKey: ['indexers'] });
    router.push('/settings/indexers');
  }

  // Create-mode state
  const [createKind, setCreateKind] = useState<'nyaa' | 'filelist' | 'torznab' | 'mam'>('nyaa');
  const [createName, setCreateName] = useState('');
  const [createBaseUrl, setCreateBaseUrl] = useState('');

  // Config form — initialized from existing indexer or defaults
  const [form, setForm] = useState<ConfigForm>(() => {
    if (indexer !== null) return parseCfg(indexer.configJson, indexer.kind);
    return defaultNyaa();
  });

  const [showPasskey, setShowPasskey] = useState(false);
  const [showMamId, setShowMamId] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [torznabCaps, setTorznabCaps] = useState<
    { id: string; name: string; subcats: { id: string; name: string }[] }[] | null
  >(null);

  // Flattened discovered categories (parents + subcats) for the picker dropdown.
  const torznabCapOptions: { id: string; label: string }[] = (torznabCaps ?? []).flatMap((c) => [
    { id: c.id, label: c.name },
    ...c.subcats.map((s) => ({ id: s.id, label: `${c.name} / ${s.name}` })),
  ]);

  // When kind picker changes in create mode, reset form to matching defaults
  function handleKindChange(newKind: 'nyaa' | 'filelist' | 'torznab' | 'mam'): void {
    setCreateKind(newKind);
    setTorznabCaps(null);
    if (newKind === 'mam') {
      // MAM is a single host; the client targets it and the row stores it for provenance.
      setCreateBaseUrl('https://www.myanonamouse.net');
    }
    setForm(
      newKind === 'torznab'
        ? defaultTorznab()
        : newKind === 'filelist'
          ? defaultFilelist()
          : newKind === 'mam'
            ? defaultMam()
            : defaultNyaa(),
    );
  }

  function toggleType(ct: ContentType): void {
    setForm((prev) => {
      const next = { ...prev };
      if (next.contentTypes.includes(ct)) {
        next.contentTypes = next.contentTypes.filter((x) => x !== ct);
      } else {
        next.contentTypes = [...next.contentTypes, ct];
      }
      return next;
    });
  }

  function setCategory(ct: ContentType, value: string): void {
    setForm((prev) => {
      if (prev.kind === 'nyaa') {
        const cat = value === '3_3' ? '3_3' : '3_1';
        return { ...prev, categoryByContentType: { ...prev.categoryByContentType, [ct]: cat } };
      }
      if (prev.kind === 'torznab') {
        return { ...prev, categoryByContentType: { ...prev.categoryByContentType, [ct]: value } };
      }
      const n = Number(value);
      if (!Number.isFinite(n)) return prev;
      return { ...prev, categoryByContentType: { ...prev.categoryByContentType, [ct]: n } };
    });
  }

  const baseUrl = isCreate ? createBaseUrl : indexer!.baseUrl;

  const capsMutation = useMutation({
    mutationFn: async () => {
      if (form.kind !== 'torznab') throw new Error('Not a Torznab indexer');
      const r = await apiFetch('/api/indexers/torznab/caps', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // On edit the API key is masked (blank); pass the row id so the server
        // falls back to the stored key when the field wasn't re-entered.
        body: JSON.stringify({
          url: baseUrl,
          apiKey: form.apiKey,
          ...(indexer !== null ? { indexerId: indexer.id } : {}),
        }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        categories?: { id: string; name: string; subcats: { id: string; name: string }[] }[];
        error?: string;
      };
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      return body.categories ?? [];
    },
    onSuccess: (categories) => {
      setTorznabCaps(categories);
      // Pre-fill empty mappings with defaults for the selected content types.
      setForm((prev) => {
        if (prev.kind !== 'torznab') return prev;
        const next = { ...prev.categoryByContentType };
        for (const ct of prev.contentTypes) {
          if (!next[ct]) next[ct] = TORZNAB_DEFAULT_CATEGORIES[ct];
        }
        return { ...prev, categoryByContentType: next };
      });
      toast.success(`Connected — ${categories.length} categories`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isCreate) {
        const r = await apiFetch('/api/indexers', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: createKind,
            name: createName,
            baseUrl: createBaseUrl,
            enabled: false,
            configJson: form,
          }),
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
      } else {
        const r = await apiFetch(`/api/indexers/${indexer!.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ configJson: form }),
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
      }
    },
    onSuccess: () => {
      toast.success(isCreate ? 'Indexer created' : 'Saved');
      done();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const title = isCreate ? 'Add indexer' : `Edit ${indexer!.name}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        actions={
          <Button variant="ghost" onClick={() => router.push('/settings/indexers')}>
            ← Back to indexers
          </Button>
        }
      />

      {/* Create-mode only: kind picker, name, baseUrl */}
      {isCreate && (
        <>
          <div className="space-y-2">
            <Label htmlFor="kind">Kind</Label>
            <Select
              value={createKind}
              onValueChange={(v) => handleKindChange(v as 'nyaa' | 'filelist' | 'torznab' | 'mam')}
            >
              <SelectTrigger id="kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nyaa">nyaa</SelectItem>
                <SelectItem value="filelist">filelist</SelectItem>
                <SelectItem value="torznab">Torznab (Prowlarr/Jackett)</SelectItem>
                <SelectItem value="mam">MyAnonaMouse</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Nyaa"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseUrl">
              {createKind === 'torznab' ? 'Torznab URL' : 'Base URL'}
            </Label>
            <Input
              id="baseUrl"
              value={createBaseUrl}
              onChange={(e) => setCreateBaseUrl(e.target.value)}
              placeholder={
                createKind === 'torznab'
                  ? 'e.g. http://prowlarr:9696/1/api'
                  : 'e.g. https://nyaa.si'
              }
            />
            {createKind === 'torznab' && (
              <p className="text-xs text-muted-foreground">
                The Torznab endpoint of a single Prowlarr/Jackett indexer, e.g.{' '}
                <code className="font-mono">http://prowlarr:9696/1/api</code>.
              </p>
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="template">Query template</Label>
        <Input
          id="template"
          value={form.queryTemplate}
          onChange={(e) => setForm((prev) => ({ ...prev, queryTemplate: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          Tokens: <code>{'{title}'}</code>, <code>{'{extra}'}</code>.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Content types</Label>
        <div className="grid grid-cols-2 gap-2">
          {CONTENT_TYPES.map((ct) => (
            <label key={ct} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.contentTypes.includes(ct)}
                onCheckedChange={() => toggleType(ct)}
              />
              {ct}
            </label>
          ))}
        </div>
      </div>

      {form.kind === 'torznab' && (
        <div className="space-y-2">
          <Label htmlFor="apiKey">API key</Label>
          <div className="flex gap-2">
            <Input
              id="apiKey"
              type={showApiKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder={isCreate ? 'Torznab API key' : 'leave empty to keep current'}
            />
            <Button variant="outline" type="button" onClick={() => setShowApiKey((v) => !v)}>
              {showApiKey ? 'Hide' : 'Show'}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => capsMutation.mutate()}
              disabled={capsMutation.isPending || !baseUrl}
            >
              {capsMutation.isPending ? 'Connecting…' : 'Fetch capabilities'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Tests the connection and discovers Newznab categories.
            </p>
          </div>
        </div>
      )}

      {form.contentTypes.length > 0 && (
        <div className="space-y-2">
          <Label>Categories</Label>
          {form.contentTypes.map((ct) => (
            <div key={ct} className="flex items-start gap-2">
              <span className="text-sm w-24 pt-2">{ct}</span>
              {form.kind === 'nyaa' ? (
                <Select
                  value={form.categoryByContentType[ct] ?? '3_1'}
                  onValueChange={(v) => setCategory(ct, v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3_1">3_1 — Literature (English-translated)</SelectItem>
                    <SelectItem value="3_3">3_3 — Literature (Raw)</SelectItem>
                  </SelectContent>
                </Select>
              ) : form.kind === 'torznab' ? (
                torznabCapOptions.length > 0 ? (
                  <TorznabCategoryPicker
                    value={form.categoryByContentType[ct] ?? ''}
                    options={torznabCapOptions}
                    onChange={(csv) => setCategory(ct, csv)}
                  />
                ) : (
                  <Input
                    className="flex-1 font-mono"
                    value={form.categoryByContentType[ct] ?? ''}
                    onChange={(e) => setCategory(ct, e.target.value)}
                    placeholder="Fetch capabilities to pick categories, or enter ids"
                  />
                )
              ) : (
                <Input
                  type="number"
                  value={form.categoryByContentType[ct] ?? ''}
                  onChange={(e) => setCategory(ct, e.target.value)}
                  placeholder="numeric category id"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {form.kind === 'torznab' && form.prowlarrIndexerId !== undefined && (
        <p className="text-xs text-muted-foreground">
          Managed by Prowlarr — its name, URL, categories, and enabled state mirror
          Prowlarr and are re-applied on each sync (disable it in Prowlarr to stop
          polling). Your poll interval is preserved.
        </p>
      )}

      {form.kind === 'filelist' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="passkey">Passkey</Label>
            <div className="flex gap-2">
              <Input
                id="passkey"
                type={showPasskey ? 'text' : 'password'}
                value={form.passkey}
                onChange={(e) => setForm((prev) => ({ ...prev, passkey: e.target.value }))}
                placeholder="leave empty to keep current"
              />
              <Button variant="outline" type="button" onClick={() => setShowPasskey((v) => !v)}>
                {showPasskey ? 'Hide' : 'Show'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Stored in plain JSON. Empty input preserves the existing value.
            </p>
          </div>
        </>
      )}

      {form.kind === 'mam' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="mamId">mam_id session</Label>
            <div className="flex gap-2">
              <Input
                id="mamId"
                type={showMamId ? 'text' : 'password'}
                value={form.mamId}
                onChange={(e) => setForm((prev) => ({ ...prev, mamId: e.target.value }))}
                placeholder={isCreate ? 'mam_id cookie value' : 'leave empty to keep current'}
                className="font-mono"
              />
              <Button variant="outline" type="button" onClick={() => setShowMamId((v) => !v)}>
                {showMamId ? 'Hide' : 'Show'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The session is IP/ASN-locked. Create a dedicated session in MAM&apos;s security
              settings. Empty input preserves the existing value.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="proxyUrl">gluetun HTTP proxy URL</Label>
            <Input
              id="proxyUrl"
              value={form.proxyUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, proxyUrl: e.target.value }))}
              placeholder="http://gluetun-httpproxy.media.svc.cluster.local:8888"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Search and .torrent downloads egress through this proxy so MAM sees the same IP as
              qBittorrent&apos;s announce. Leave empty to egress directly (dev only).
            </p>
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="pollInterval">Poll every (seconds)</Label>
        <Input
          id="pollInterval"
          type="number"
          min={60}
          max={86400}
          value={form.pollIntervalSeconds}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) {
              setForm((prev) => ({ ...prev, pollIntervalSeconds: n }));
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          Range: 60–86400 seconds ({Math.round(form.pollIntervalSeconds / 60)} min).
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={() => router.push('/settings/indexers')}>
          Cancel
        </Button>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
