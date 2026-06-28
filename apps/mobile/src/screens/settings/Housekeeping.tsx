import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import {
  useMe,
  useHousekeeping,
  useSaveHousekeeping,
  type HousekeepingSection,
  type SectionBody,
} from '@/api/hooks';
import type { HousekeepingOverview } from '@/api/schemas';
import { parseIntInRange } from '@/lib/parse-int-range';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

// ── Section descriptors ───────────────────────────────────────────────────────
// Each section maps to a per-section PATCH route and two numeric fields with
// server-validated ranges (mirrors the web housekeeping route schemas).
interface FieldDef {
  key: string;
  label: string;
  min: number;
  max: number;
}
interface SectionDef {
  section: HousekeepingSection;
  title: string;
  fields: [FieldDef, FieldDef];
}

const SECTIONS: SectionDef[] = [
  {
    section: 'jobs',
    title: 'Job retention',
    fields: [
      { key: 'terminalDays', label: 'Completed/cancelled job days', min: 1, max: 3650 },
      { key: 'errorDays', label: 'Failed job days', min: 1, max: 3650 },
    ],
  },
  {
    section: 'backups',
    title: 'Backup retention',
    fields: [
      { key: 'daily', label: 'Daily backups kept', min: 0, max: 365 },
      { key: 'monthlyDay1', label: 'Monthly (1st) backups kept', min: 0, max: 365 },
    ],
  },
  {
    section: 'visibility',
    title: 'Audit & log retention',
    fields: [
      { key: 'auditRetentionDays', label: 'Audit event days', min: 1, max: 3650 },
      { key: 'logRetentionDays', label: 'Log file days', min: 1, max: 365 },
    ],
  },
  {
    section: 'releases',
    title: 'Release retention',
    fields: [
      { key: 'keepPerSeries', label: 'Releases kept per series', min: 0, max: 10000 },
      { key: 'olderThanDays', label: 'Prune releases older than (days)', min: 1, max: 3650 },
    ],
  },
];

function SectionTitle({ children }: { children: string }) {
  const t = useTokens();
  return (
    <Text style={[text.displaySm, { color: t.text, marginTop: 22, marginBottom: 10 }]}>
      {children}
    </Text>
  );
}

// A single section: two numeric fields, per-field validation, per-section dirty
// tracking, and a Save that PATCHes only this section.
function HousekeepingSectionForm({
  def,
  initial,
}: {
  def: SectionDef;
  initial: HousekeepingOverview[HousekeepingSection];
}) {
  const save = useSaveHousekeeping(def.section);
  const { gate, disabledProps } = useOnlineGate();

  // `initial` is a typed section object (e.g. JobRetention); we read it via a
  // string key because `def.fields[].key` is a runtime string that maps exactly
  // to the section's two fields.  The cast to Record<string, number> is safe:
  // all section types have exclusively numeric values.
  const initialMap = initial as Record<string, number>;

  const seed = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const f of def.fields) out[f.key] = String(initialMap[f.key] ?? '');
    return out;
  };
  const [draft, setDraft] = useState<Record<string, string>>(seed);

  // Per-field parse results.
  const parsed = def.fields.map((f) => ({
    field: f,
    result: parseIntInRange(draft[f.key] ?? '', f.min, f.max),
  }));

  const hasError = parsed.some((p) => !p.result.ok);
  const dirty = def.fields.some((f) => draft[f.key] !== String(initialMap[f.key] ?? ''));

  const onSave = () => {
    // Re-validate; bail if any field is invalid (defensive — button is disabled too).
    const body: Record<string, number> = {};
    for (const p of parsed) {
      if (!p.result.ok) return;
      body[p.field.key] = p.result.value;
    }
    // The body keys are the section's two fields exactly; the shape satisfies
    // SectionBody[S] but cannot be proven without overhauling HousekeepingSectionForm
    // to a fully generic component keyed on S — narrowing to the union is the
    // minimal safe cast.
    save.mutate(body as SectionBody[HousekeepingSection]);
  };

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>{def.title}</SectionTitle>
      {def.fields.map((f) => {
        const r = parseIntInRange(draft[f.key] ?? '', f.min, f.max);
        return (
          <TextField
            key={f.key}
            testID={`hk-${def.section}-${f.key}`}
            label={f.label}
            value={draft[f.key] ?? ''}
            onChangeText={(next) => setDraft((d) => ({ ...d, [f.key]: next }))}
            keyboardType="number-pad"
            {...(r.ok ? { helper: `Range ${f.min}–${f.max}` } : { error: r.error })}
          />
        );
      })}
      {save.isError ? (
        <InlineAlert
          tone="err"
          body="Couldn't save this section."
          testID={`hk-${def.section}-save-error`}
        />
      ) : null}
      <Button
        testID={`hk-${def.section}-save`}
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={gate(onSave)}
        disabled={!dirty || hasError || save.isPending || disabledProps.disabled}
      />
    </View>
  );
}

function HousekeepingAdminView() {
  const t = useTokens();
  const q = useHousekeeping();
  const data = q.data;
  const online = useIsOnline();

  if (!online && q.data === undefined) return <SettingsOfflineState />;
  if (q.isLoading || data === undefined) {
    return (
      <Text style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}>
        Loading…
      </Text>
    );
  }
  if (q.isError) {
    return (
      <View style={{ paddingTop: 8 }}>
        <InlineAlert
          tone="err"
          body="Couldn't load housekeeping settings."
          testID="housekeeping-load-error"
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4 }}>
      {SECTIONS.map((def) => (
        <HousekeepingSectionForm
          key={def.section}
          def={def}
          initial={data[def.section]}
        />
      ))}
    </ScrollView>
  );
}

export default function Housekeeping() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-housekeeping">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-housekeeping" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Housekeeping</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Housekeeping settings require an administrator account."
            testID="housekeeping-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <HousekeepingAdminView />
      ) : null}
    </ScreenContainer>
  );
}
