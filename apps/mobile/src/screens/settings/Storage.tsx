import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Toggle } from '@/components/Toggle';
import { FormField } from '@/components/FormField';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { useMe, useStorage, useSaveStorage } from '@/api/hooks';
import type { StorageSettings, ContentTypeEnum, TorrentCleanup } from '@/api/schemas/library';
import { parseIntInRange } from '@/lib/parse-int-range';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

// ── Content types (raw API enum values) ─────────────────────────────────────────
type Ct = ContentTypeEnum;
const CONTENT_TYPES: { ct: Ct; label: string }[] = [
  { ct: 'manga', label: 'Manga' },
  { ct: 'comic', label: 'Comic' },
  { ct: 'light_novel', label: 'Light novel' },
  { ct: 'ebook', label: 'eBook' },
  { ct: 'audiobook', label: 'Audiobook' },
];

type CleanupMode = TorrentCleanup['mode'];
const CLEANUP_MODES: CleanupMode[] = ['never', 'after_import', 'after_ratio', 'after_seed_time'];
const CLEANUP_LABELS: Record<CleanupMode, string> = {
  never: 'Never',
  after_import: 'After import',
  after_ratio: 'After ratio',
  after_seed_time: 'After seed time',
};

interface PathEntry {
  libraryRoot: string;
  qbtCategory: string;
}

// Local draft is fully populated for all 5 content types so the PUT always
// satisfies the server's `.strict()` schema (every type, both keys present).
interface Draft {
  paths: Record<Ct, PathEntry>;
  mode: CleanupMode;
  ratio: string; // raw input; only sent when mode === after_ratio
  seedMinutes: string; // raw input; only sent when mode === after_seed_time
  deleteFiles: boolean;
  cacheEnabled: boolean;
  cacheDir: string;
}

function seedDraft(data: StorageSettings): Draft {
  const paths = {} as Record<Ct, PathEntry>;
  for (const { ct } of CONTENT_TYPES) {
    const entry = data.contentTypePaths[ct] ?? { libraryRoot: '', qbtCategory: '' };
    paths[ct] = { libraryRoot: entry.libraryRoot, qbtCategory: entry.qbtCategory };
  }
  return {
    paths,
    mode: data.torrentCleanup.mode,
    ratio: data.torrentCleanup.ratio !== undefined ? String(data.torrentCleanup.ratio) : '',
    seedMinutes:
      data.torrentCleanup.seedMinutes !== undefined ? String(data.torrentCleanup.seedMinutes) : '',
    deleteFiles: data.torrentCleanup.deleteFiles,
    cacheEnabled: data.imageCache.enabled,
    cacheDir: data.imageCache.dir,
  };
}

// Build the exact PUT body the server expects: all 5 content types with both
// keys, torrentCleanup carrying `ratio` ONLY for after_ratio and `seedMinutes`
// ONLY for after_seed_time (omitted otherwise), and the full imageCache object.
function buildBody(d: Draft): StorageSettings {
  const ratio = parseFloat(d.ratio);
  const seed = parseIntInRange(d.seedMinutes, 1, Number.MAX_SAFE_INTEGER);
  const torrentCleanup: TorrentCleanup = {
    mode: d.mode,
    deleteFiles: d.deleteFiles,
    ...(d.mode === 'after_ratio' && Number.isFinite(ratio) && ratio > 0 ? { ratio } : {}),
    ...(d.mode === 'after_seed_time' && seed.ok ? { seedMinutes: seed.value } : {}),
  };
  return {
    contentTypePaths: d.paths,
    torrentCleanup,
    imageCache: { enabled: d.cacheEnabled, dir: d.cacheDir },
  };
}

function SectionTitle({ children }: { children: string }) {
  const t = useTokens();
  return (
    <Text style={[text.displaySm, { color: t.text, marginTop: 22, marginBottom: 10 }]}>
      {children}
    </Text>
  );
}

// Solid-background segmented control: selected = solid primary, unselected =
// solid surfaceMuted (never translucent), per the design system.
function Segmented({
  value,
  onChange,
}: {
  value: CleanupMode;
  onChange: (next: CleanupMode) => void;
}) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {CLEANUP_MODES.map((opt) => {
        const selected = opt === value;
        return (
          <Pressable
            key={opt}
            testID={`storage-cleanup-${opt}`}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: selected ? t.primary : t.surfaceMuted,
              borderWidth: 1,
              borderColor: selected ? t.primary : t.border,
            }}
          >
            <Text
              style={{
                fontFamily: fonts.sans.medium,
                fontSize: 13,
                color: selected ? t.primaryFg : t.textMuted,
              }}
            >
              {CLEANUP_LABELS[opt]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StorageAdminView() {
  const t = useTokens();
  const q = useStorage();
  const save = useSaveStorage();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (q.data && !seeded) {
      setDraft(seedDraft(q.data));
      setSeeded(true);
    }
  }, [q.data, seeded]);

  if (!online && q.data === undefined) return <SettingsOfflineState />;
  if (q.isLoading || q.data === undefined || !seeded || draft === null) {
    return (
      <Text style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}>
        Loading…
      </Text>
    );
  }

  if (q.isError) {
    return (
      <View style={{ paddingTop: 8 }}>
        <InlineAlert tone="err" body="Couldn't load storage settings." testID="storage-load-error" />
      </View>
    );
  }

  const d = draft;
  const baseline = seedDraft(q.data);
  const dirty = JSON.stringify(d) !== JSON.stringify(baseline);

  // Conditional numeric validity (only blocks Save when the field is shown).
  const ratioNum = parseFloat(d.ratio);
  const ratioValid = d.mode !== 'after_ratio' || (Number.isFinite(ratioNum) && ratioNum > 0);
  const seedResult = parseIntInRange(d.seedMinutes, 1, Number.MAX_SAFE_INTEGER);
  const seedValid = d.mode !== 'after_seed_time' || seedResult.ok;
  const canSave = dirty && ratioValid && seedValid && !save.isPending;

  const setPath = (ct: Ct, key: keyof PathEntry, next: string) =>
    setDraft((prev) =>
      prev ? { ...prev, paths: { ...prev.paths, [ct]: { ...prev.paths[ct], [key]: next } } } : prev,
    );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4 }}>
      <SectionTitle>Library paths</SectionTitle>
      {CONTENT_TYPES.map(({ ct, label }) => (
        <View key={ct} style={{ gap: 10, marginBottom: 18 }}>
          <Text style={[text.label, { color: t.text }]}>{label}</Text>
          <TextField
            testID={`storage-${ct}-root`}
            label="Library root"
            value={d.paths[ct].libraryRoot}
            onChangeText={(next) => setPath(ct, 'libraryRoot', next)}
            placeholder="blank = default"
            helper="blank = default"
          />
          <TextField
            testID={`storage-${ct}-category`}
            label="qBittorrent category"
            value={d.paths[ct].qbtCategory}
            onChangeText={(next) => setPath(ct, 'qbtCategory', next)}
            placeholder="blank = default"
            helper="blank = default"
          />
        </View>
      ))}

      <SectionTitle>Torrent cleanup</SectionTitle>
      <View style={{ gap: 14 }}>
        <Segmented value={d.mode} onChange={(mode) => setDraft((p) => (p ? { ...p, mode } : p))} />

        {d.mode === 'after_ratio' ? (
          <TextField
            testID="storage-ratio"
            label="Seed ratio"
            value={d.ratio}
            onChangeText={(next) => setDraft((p) => (p ? { ...p, ratio: next } : p))}
            keyboardType="decimal-pad"
            {...(ratioValid ? { helper: 'Remove after this ratio' } : { error: 'Enter a positive number' })}
          />
        ) : null}

        {d.mode === 'after_seed_time' ? (
          <TextField
            testID="storage-seed-minutes"
            label="Seed minutes"
            value={d.seedMinutes}
            onChangeText={(next) => setDraft((p) => (p ? { ...p, seedMinutes: next } : p))}
            keyboardType="number-pad"
            {...(seedResult.ok
              ? { helper: 'Remove after this many minutes' }
              : { error: seedResult.error })}
          />
        ) : null}

        <FormField
          label="Delete files on removal"
          helper="Also delete data from disk when a torrent is removed"
          trailing={
            <Toggle
              testID="storage-delete-files"
              on={d.deleteFiles}
              onChange={(next) => setDraft((p) => (p ? { ...p, deleteFiles: next } : p))}
            />
          }
        />
      </View>

      <SectionTitle>Image cache</SectionTitle>
      <View style={{ gap: 14 }}>
        <FormField
          label="Cache cover art"
          helper="Store a server-side copy of library covers"
          trailing={
            <Toggle
              testID="storage-cache-enabled"
              on={d.cacheEnabled}
              onChange={(next) => setDraft((p) => (p ? { ...p, cacheEnabled: next } : p))}
            />
          }
        />
        <TextField
          testID="storage-cache-dir"
          label="Cache directory"
          value={d.cacheDir}
          onChangeText={(next) => setDraft((p) => (p ? { ...p, cacheDir: next } : p))}
          placeholder="blank = default"
          helper="blank = default"
        />
      </View>

      {save.isError ? (
        <View style={{ marginTop: 12 }}>
          <InlineAlert tone="err" body="Couldn't save storage settings." testID="storage-save-error" />
        </View>
      ) : null}

      <Button
        testID="storage-save"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={gate(() => save.mutate(buildBody(d)))}
        disabled={!canSave || disabledProps.disabled}
        style={{ marginTop: 20 }}
      />
    </ScrollView>
  );
}

export default function Storage() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-storage">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-storage" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Storage</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Storage settings require an administrator account."
            testID="storage-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <StorageAdminView />
      ) : null}
    </ScreenContainer>
  );
}
