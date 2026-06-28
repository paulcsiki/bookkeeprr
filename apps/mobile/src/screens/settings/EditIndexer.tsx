import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Checkbox } from '@/components/Checkbox';
import { InlineAlert } from '@/components/InlineAlert';
import { ApiError } from '@/api/client';
import { parseIntInRange } from '@/lib/parse-int-range';
import {
  parseIndexerConfig,
  type IndexerView,
  type IndexerKind,
  type IndexerContentType,
  type IndexerConfig,
  type NyaaCategory,
  type TorznabCaps,
} from '@/api/schemas';
import {
  useIndexers,
  useCreateIndexer,
  useUpdateIndexer,
  useTorznabCaps,
} from '@/api/hooks';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import type { SettingsStackParamList } from '@/navigation/types';
import { useOnlineGate, useIsOnline } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'EditIndexer'>;
type Rt = RouteProp<SettingsStackParamList, 'EditIndexer'>;

const CONTENT_TYPES: IndexerContentType[] = [
  'manga',
  'comic',
  'light_novel',
  'ebook',
  'audiobook',
];

const CONTENT_TYPE_LABELS: Record<IndexerContentType, string> = {
  manga: 'Manga',
  comic: 'Comic',
  light_novel: 'Light novel',
  ebook: 'eBook',
  audiobook: 'Audiobook',
};

const NYAA_CATEGORIES: { value: NyaaCategory; label: string }[] = [
  { value: '3_1', label: '3_1 — English-translated' },
  { value: '3_3', label: '3_3 — Raw' },
];

const DEFAULT_QUERY = '{title} {extra}';
const DEFAULT_POLL = 900;

/** Shared editable form state for all four kinds. Secrets stay '' = keep. */
interface FormState {
  kind: IndexerKind;
  name: string;
  baseUrl: string;
  queryTemplate: string;
  contentTypes: IndexerContentType[];
  poll: string; // raw numeric string, validated via parseIntInRange
  // nyaa: '3_1'|'3_3'; filelist/mam: numeric string; torznab: csv of category ids
  categoryByContentType: Partial<Record<IndexerContentType, string>>;
  username: string;
  passkey: string;
  apiKey: string;
  prowlarrIndexerId: number | undefined;
  mamId: string;
  proxyUrl: string;
  searchIn: string[];
}

function seedForm(mode: 'create' | 'edit', indexer: IndexerView | undefined): FormState {
  if (mode === 'edit' && indexer) {
    const cfg = parseIndexerConfig(indexer.configJson);
    const cats: Partial<Record<IndexerContentType, string>> = {};
    if (cfg.kind === 'nyaa') {
      for (const [ct, v] of Object.entries(cfg.categoryByContentType)) {
        cats[ct as IndexerContentType] = v;
      }
    } else if (cfg.kind === 'filelist' || cfg.kind === 'mam') {
      for (const [ct, v] of Object.entries(cfg.categoryByContentType)) {
        cats[ct as IndexerContentType] = String(v);
      }
    } else {
      // torznab: csv strings
      for (const [ct, v] of Object.entries(cfg.categoryByContentType)) {
        cats[ct as IndexerContentType] = v;
      }
    }
    return {
      kind: cfg.kind,
      name: indexer.name,
      baseUrl: indexer.baseUrl,
      queryTemplate: cfg.queryTemplate,
      contentTypes: [...cfg.contentTypes],
      poll: String(cfg.pollIntervalSeconds),
      categoryByContentType: cats,
      username: cfg.kind === 'filelist' ? cfg.username : '',
      passkey: '', // masked on GET; blank = keep
      apiKey: '', // masked on GET; blank = keep
      prowlarrIndexerId: cfg.kind === 'torznab' ? cfg.prowlarrIndexerId : undefined,
      mamId: '', // masked on GET; blank = keep
      proxyUrl: cfg.kind === 'mam' ? cfg.proxyUrl : '',
      searchIn: cfg.kind === 'mam' ? [...cfg.searchIn] : ['title'],
    };
  }
  return {
    kind: 'nyaa',
    name: '',
    baseUrl: '',
    queryTemplate: DEFAULT_QUERY,
    contentTypes: [],
    poll: String(DEFAULT_POLL),
    categoryByContentType: {},
    username: '',
    passkey: '',
    apiKey: '',
    prowlarrIndexerId: undefined,
    mamId: '',
    proxyUrl: '',
    searchIn: ['title'],
  };
}

/**
 * Build the typed IndexerConfig from form state.
 *
 * Secrets (apiKey / passkey) are ALWAYS included as strings. When the field is
 * left blank ('' after trim), we send '' — the server treats '' as the
 * "keep stored secret" signal. When the user typed a value, we send it. This
 * matches the server PATCH schema where apiKey/passkey are required strings and
 * '' is the keep-signal (omitting the field would fail ConfigBody.safeParse).
 */
function buildConfig(form: FormState): IndexerConfig {
  const poll = parseIntInRange(form.poll, 60, 86400);
  const pollIntervalSeconds = poll.ok ? poll.value : DEFAULT_POLL;
  const contentTypes = [...form.contentTypes];

  if (form.kind === 'nyaa') {
    const categoryByContentType: Partial<Record<IndexerContentType, NyaaCategory>> = {};
    for (const ct of contentTypes) {
      const raw = form.categoryByContentType[ct];
      categoryByContentType[ct] = raw === '3_3' ? '3_3' : '3_1';
    }
    return {
      kind: 'nyaa',
      queryTemplate: form.queryTemplate,
      contentTypes,
      categoryByContentType,
      pollIntervalSeconds,
    };
  }

  if (form.kind === 'filelist') {
    const categoryByContentType: Partial<Record<IndexerContentType, number>> = {};
    for (const ct of contentTypes) {
      const r = parseIntInRange(form.categoryByContentType[ct] ?? '', 0, Number.MAX_SAFE_INTEGER);
      if (r.ok) categoryByContentType[ct] = r.value;
    }
    // Always include passkey: '' means "keep stored value" (server contract).
    const passkey = form.passkey.trim();
    return {
      kind: 'filelist',
      queryTemplate: form.queryTemplate,
      contentTypes,
      categoryByContentType,
      username: form.username,
      passkey,
      pollIntervalSeconds,
    } as IndexerConfig;
  }

  if (form.kind === 'mam') {
    const categoryByContentType: Partial<Record<IndexerContentType, number>> = {};
    for (const ct of contentTypes) {
      const r = parseIntInRange(form.categoryByContentType[ct] ?? '', 0, Number.MAX_SAFE_INTEGER);
      if (r.ok) categoryByContentType[ct] = r.value;
    }
    // Always include mamId: '' means "keep stored value" (server contract).
    const mamId = form.mamId.trim();
    return {
      kind: 'mam',
      queryTemplate: form.queryTemplate,
      contentTypes,
      categoryByContentType,
      mamId,
      proxyUrl: form.proxyUrl.trim(),
      searchIn: form.searchIn,
      pollIntervalSeconds,
    } as IndexerConfig;
  }

  const categoryByContentType: Partial<Record<IndexerContentType, string>> = {};
  for (const ct of contentTypes) {
    const csv = (form.categoryByContentType[ct] ?? '').trim();
    if (csv.length > 0) categoryByContentType[ct] = csv;
  }
  // Always include apiKey: '' means "keep stored value" (server contract).
  const apiKey = form.apiKey.trim();
  return {
    kind: 'torznab',
    queryTemplate: form.queryTemplate,
    contentTypes,
    categoryByContentType,
    apiKey,
    pollIntervalSeconds,
    ...(form.prowlarrIndexerId !== undefined
      ? { prowlarrIndexerId: form.prowlarrIndexerId }
      : {}),
  } as IndexerConfig;
}

/** Flatten discovered caps (parents + subcats) into selectable options. */
function flattenCaps(caps: TorznabCaps | undefined): { id: string; label: string }[] {
  if (!caps) return [];
  return caps.categories.flatMap((c) => [
    { id: c.id, label: c.name },
    ...c.subcats.map((s) => ({ id: s.id, label: `${c.name} / ${s.name}` })),
  ]);
}

/** A solid, selectable pill (SOLID backgrounds per the design system). */
function SelectPill({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTokens();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: selected ? t.primary : t.surfaceMuted,
        borderColor: selected ? t.primary : t.border,
      }}
    >
      <Text style={[text.monoSm, { color: selected ? t.primaryFg : t.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The form body. Seeded once at mount via a lazy initializer — so in edit mode
 * this must only be mounted AFTER the indexer has resolved from the query
 * (otherwise it seeds from undefined). The parent screen owns that guard.
 */
function EditIndexerForm({
  mode,
  indexer,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  indexer: IndexerView | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTokens();
  const create = useCreateIndexer();
  const update = useUpdateIndexer();
  const caps = useTorznabCaps();
  const { gate, disabledProps } = useOnlineGate();

  const [form, setForm] = useState<FormState>(() => seedForm(mode, indexer));
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode === 'edit' && indexer !== undefined;
  const pollResult = parseIntInRange(form.poll, 60, 86400);
  const capOptions = useMemo(() => flattenCaps(caps.data), [caps.data]);

  function patch(p: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...p }));
    setError(null);
  }

  function setKind(kind: IndexerKind) {
    // Reset kind-specific fields so the discriminated config stays clean.
    setForm((prev) => ({
      ...prev,
      kind,
      categoryByContentType: {},
      username: '',
      passkey: '',
      apiKey: '',
      prowlarrIndexerId: undefined,
      mamId: '',
      proxyUrl: '',
      searchIn: ['title'],
      ...(kind === 'mam' ? { baseUrl: 'https://www.myanonamouse.net' } : {}),
    }));
    caps.reset();
    setError(null);
  }

  function toggleContentType(ct: IndexerContentType) {
    setForm((prev) => {
      const has = prev.contentTypes.includes(ct);
      const contentTypes = has
        ? prev.contentTypes.filter((x) => x !== ct)
        : [...prev.contentTypes, ct];
      return { ...prev, contentTypes };
    });
    setError(null);
  }

  function setCategory(ct: IndexerContentType, value: string) {
    setForm((prev) => ({
      ...prev,
      categoryByContentType: { ...prev.categoryByContentType, [ct]: value },
    }));
    setError(null);
  }

  function toggleTorznabCat(ct: IndexerContentType, id: string) {
    setForm((prev) => {
      const current = (prev.categoryByContentType[ct] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      return {
        ...prev,
        categoryByContentType: { ...prev.categoryByContentType, [ct]: next.join(',') },
      };
    });
    setError(null);
  }

  function onFetchCaps() {
    setError(null);
    caps.mutate(
      {
        url: form.baseUrl,
        apiKey: form.apiKey,
        ...(isEdit ? { indexerId: indexer.id } : {}),
      },
      { onError: () => setError('Could not fetch capabilities — check the URL and key.') },
    );
  }

  function onSave() {
    setError(null);
    const name = form.name.trim();
    const baseUrl = form.baseUrl.trim();
    if (name.length === 0) {
      setError('Name is required.');
      return;
    }
    if (!isEdit && baseUrl.length === 0) {
      setError('Base URL is required.');
      return;
    }
    // A new torznab indexer can't authenticate without a key. On edit a blank
    // key means "keep the stored one" (server contract), so only guard create.
    if (!isEdit && form.kind === 'torznab' && form.apiKey.trim().length === 0) {
      setError('API key is required for a Torznab indexer.');
      return;
    }
    // A new MAM indexer needs the mam_id cookie. On edit, blank = keep stored.
    if (!isEdit && form.kind === 'mam' && form.mamId.trim().length === 0) {
      setError('MAM ID is required for a MyAnonaMouse indexer.');
      return;
    }
    if (!pollResult.ok) {
      setError(`Poll interval: ${pollResult.error.toLowerCase()} (60–86400).`);
      return;
    }

    const configJson = buildConfig(form);

    const onError = (e: unknown) => {
      setError(e instanceof ApiError ? 'Save failed — check the server.' : 'Save failed.');
    };

    if (isEdit) {
      update.mutate(
        { id: indexer.id, name, configJson },
        { onSuccess: () => onSaved(), onError },
      );
    } else {
      create.mutate(
        { kind: form.kind, name, baseUrl, enabled: true, configJson },
        { onSuccess: () => onSaved(), onError },
      );
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 4, paddingTop: 6, paddingBottom: 48, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Kind selector — create only */}
      {!isEdit ? (
        <View style={{ gap: 8 }}>
          <Text style={[text.label, { color: t.textMuted }]}>Kind</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['nyaa', 'filelist', 'torznab', 'mam'] as IndexerKind[]).map((k) => (
              <SelectPill
                key={k}
                testID={`ei-kind-${k}`}
                label={k}
                selected={form.kind === k}
                onPress={() => setKind(k)}
              />
            ))}
          </View>
        </View>
      ) : (
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: t.surfaceMuted,
          }}
        >
          <Text style={[text.monoSm, { color: t.text }]}>{form.kind.toUpperCase()}</Text>
        </View>
      )}

      <TextField
        testID="ei-name"
        label="Name"
        value={form.name}
        onChangeText={(v) => patch({ name: v })}
        placeholder="e.g. Nyaa"
      />

      {!isEdit ? (
        <TextField
          testID="ei-baseurl"
          label={form.kind === 'torznab' ? 'Torznab URL' : 'Base URL'}
          value={form.baseUrl}
          onChangeText={(v) => patch({ baseUrl: v })}
          placeholder={
            form.kind === 'torznab' ? 'http://prowlarr:9696/1/api' : 'https://nyaa.si'
          }
        />
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={[text.label, { color: t.textMuted }]}>Base URL</Text>
          <Text style={[text.monoSm, { color: t.text }]}>{form.baseUrl}</Text>
        </View>
      )}

      <TextField
        testID="ei-query"
        label="Query template"
        value={form.queryTemplate}
        onChangeText={(v) => patch({ queryTemplate: v })}
        helper="Tokens: {title}, {extra}"
        autoCapitalize="none"
      />

      {/* Content types */}
      <View style={{ gap: 8 }}>
        <Text style={[text.label, { color: t.textMuted }]}>Content types</Text>
        {CONTENT_TYPES.map((ct) => (
          <Pressable
            key={ct}
            onPress={() => toggleContentType(ct)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}
          >
            <Checkbox
              testID={`ei-ct-${ct}`}
              checked={form.contentTypes.includes(ct)}
              onChange={() => toggleContentType(ct)}
            />
            <Text style={[text.body, { color: t.text }]}>{CONTENT_TYPE_LABELS[ct]}</Text>
          </Pressable>
        ))}
      </View>

      {/* Filelist credentials */}
      {form.kind === 'filelist' ? (
        <>
          <TextField
            testID="ei-username"
            label="Username"
            value={form.username}
            onChangeText={(v) => patch({ username: v })}
          />
          <TextField
            testID="ei-passkey"
            label="Passkey"
            value={form.passkey}
            onChangeText={(v) => patch({ passkey: v })}
            secureTextEntry
            placeholder={isEdit ? '•••• (leave blank to keep)' : ''}
            {...(isEdit ? { helper: 'Leave blank to keep the stored passkey.' } : {})}
          />
        </>
      ) : null}

      {/* Torznab api key + caps */}
      {form.kind === 'torznab' ? (
        <>
          <TextField
            testID="ei-apikey"
            label="API key"
            value={form.apiKey}
            onChangeText={(v) => patch({ apiKey: v })}
            secureTextEntry
            placeholder={isEdit ? '•••• (leave blank to keep)' : 'Torznab API key'}
            {...(isEdit ? { helper: 'Leave blank to keep the stored key.' } : {})}
          />
          <Button
            testID="ei-fetch-caps"
            label={caps.isPending ? 'Fetching…' : 'Fetch capabilities'}
            variant="secondary"
            onPress={gate(onFetchCaps)}
            disabled={caps.isPending || form.baseUrl.trim().length === 0 || disabledProps.disabled}
          />
          {form.prowlarrIndexerId !== undefined ? (
            <Text style={[text.monoSm, { color: t.textMuted }]}>
              Managed by Prowlarr — categories mirror Prowlarr and re-apply on each sync.
            </Text>
          ) : null}
        </>
      ) : null}

      {/* MAM credentials */}
      {form.kind === 'mam' ? (
        <>
          <TextField
            testID="ei-mamid"
            label="MAM ID"
            value={form.mamId}
            onChangeText={(v) => patch({ mamId: v })}
            secureTextEntry
            placeholder={isEdit ? '•••• (leave blank to keep)' : 'mam_id cookie value'}
            {...(isEdit ? { helper: 'Leave blank to keep the stored mam_id.' } : {})}
          />
          <TextField
            testID="ei-proxyurl"
            label="Proxy URL"
            value={form.proxyUrl}
            onChangeText={(v) => patch({ proxyUrl: v })}
            autoCapitalize="none"
            placeholder="http://gluetun-httpproxy.media.svc.cluster.local:8888"
            helper="Leave empty to egress directly (dev only)."
          />
        </>
      ) : null}

      {/* Per-content-type categories */}
      {form.contentTypes.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={[text.label, { color: t.textMuted }]}>Categories</Text>
          {form.contentTypes.map((ct) => (
            <View key={ct} style={{ gap: 6 }}>
              <Text style={[text.bodySm, { color: t.text }]}>{CONTENT_TYPE_LABELS[ct]}</Text>

              {form.kind === 'nyaa' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {NYAA_CATEGORIES.map((c) => (
                    <SelectPill
                      key={c.value}
                      testID={`ei-cat-${ct}-${c.value}`}
                      label={c.label}
                      selected={(form.categoryByContentType[ct] ?? '3_1') === c.value}
                      onPress={() => setCategory(ct, c.value)}
                    />
                  ))}
                </View>
              ) : null}

              {form.kind === 'filelist' || form.kind === 'mam' ? (
                <TextField
                  testID={`ei-cat-${ct}`}
                  label=""
                  value={form.categoryByContentType[ct] ?? ''}
                  onChangeText={(v) => setCategory(ct, v)}
                  keyboardType="number-pad"
                  placeholder="numeric category id"
                />
              ) : null}

              {form.kind === 'torznab' ? (
                capOptions.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {capOptions.map((o) => {
                      const selected = (form.categoryByContentType[ct] ?? '')
                        .split(',')
                        .map((s) => s.trim())
                        .includes(o.id);
                      return (
                        <SelectPill
                          key={o.id}
                          testID={`ei-cat-${ct}-${o.id}`}
                          label={`${o.id} · ${o.label}`}
                          selected={selected}
                          onPress={() => toggleTorznabCat(ct, o.id)}
                        />
                      );
                    })}
                  </View>
                ) : (
                  <TextField
                    testID={`ei-cat-${ct}`}
                    label=""
                    value={form.categoryByContentType[ct] ?? ''}
                    onChangeText={(v) => setCategory(ct, v)}
                    placeholder="Fetch capabilities, or enter ids (csv)"
                  />
                )
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <TextField
        testID="ei-poll"
        label="Poll every (seconds)"
        value={form.poll}
        onChangeText={(v) => patch({ poll: v })}
        keyboardType="number-pad"
        {...(pollResult.ok
          ? { helper: `${Math.round(pollResult.value / 60)} min` }
          : { error: pollResult.error })}
      />

      {error !== null ? <InlineAlert tone="err" body={error} testID="ei-error" /> : null}

      <View style={{ gap: 10, marginTop: 4 }}>
        <Button
          testID="ei-save"
          label={saving ? 'Saving…' : 'Save'}
          onPress={gate(onSave)}
          disabled={saving || disabledProps.disabled}
        />
        <Button testID="ei-cancel" label="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </ScrollView>
  );
}

export default function EditIndexer() {
  const t = useTokens();
  const nav = useNavigation<Nav>();
  const indexerId = useRoute<Rt>().params?.indexerId;
  const isEdit = indexerId != null;

  const q = useIndexers();
  const online = useIsOnline();
  const indexer = isEdit ? q.data?.indexers?.find((i) => i.id === indexerId) : undefined;

  // In edit mode the form must seed from the resolved indexer; mount the body
  // (whose lazy initializer reads the indexer ONCE) only after it's available.
  // Distinguish a fetch failure (retry-able; stranded on a flaky connection)
  // from a genuine not-found so the message isn't misleading. If the fetch
  // errored but stale data still resolved the indexer, render the form.
  const loadingEdit = isEdit && q.isLoading && indexer === undefined;
  const errorEdit = isEdit && q.isError && indexer === undefined;
  const missingEdit = isEdit && !q.isLoading && !q.isError && indexer === undefined;

  return (
    <ScreenContainer testID="screen-edit-indexer">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-edit-indexer" onPress={() => nav.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>
          {isEdit ? 'Edit Indexer' : 'Add Indexer'}
        </Text>
      </View>

      {isEdit && !online && q.data === undefined ? (
        <SettingsOfflineState />
      ) : loadingEdit ? (
        <Text style={[text.bodySm, { color: t.textMuted, paddingVertical: 16, paddingHorizontal: 4 }]}>
          Loading…
        </Text>
      ) : errorEdit ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="err"
            body="Couldn't load indexers."
            testID="edit-indexer-load-error"
          />
        </View>
      ) : missingEdit ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="err"
            body="Couldn't find that indexer."
            testID="edit-indexer-missing"
          />
        </View>
      ) : (
        <EditIndexerForm
          mode={isEdit ? 'edit' : 'create'}
          indexer={indexer}
          onClose={() => nav.goBack()}
          onSaved={() => nav.goBack()}
        />
      )}
    </ScreenContainer>
  );
}
