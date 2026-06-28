import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Toggle } from '@/components/Toggle';
import { TagTokenInput } from '@/components/TagTokenInput';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import {
  useMe,
  useMatcher,
  useSaveMatcherWeights,
  useSaveAdultFilter,
} from '@/api/hooks';
import type { MatcherWeights, AdultFilter, MatcherOverview, ReplayRun } from '@/api/schemas';
import { parseIntInRange } from '@/lib/parse-int-range';
import { ReplayHistorySection } from '@/features/settings/matcher/ReplayHistorySection';
import { ReplayRunDetailSheet } from '@/features/settings/matcher/ReplayRunDetailSheet';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

// ── Weight field descriptors ────────────────────────────────────────────────
// Ranges mirror the web PATCH /api/settings/matcher/weights schema exactly.
// remakePenalty is negative-only, so its field allows a typed minus sign.
interface WeightDef {
  key: keyof MatcherWeights;
  label: string;
  min: number;
  max: number;
}

const WEIGHTS: WeightDef[] = [
  { key: 'groupTopWeight', label: 'Group top weight', min: 0, max: 1000 },
  { key: 'groupStepDown', label: 'Group step-down', min: 0, max: 100 },
  { key: 'batchBonus', label: 'Batch bonus', min: 0, max: 1000 },
  { key: 'seederMultiplier', label: 'Seeder multiplier', min: 0, max: 100 },
  { key: 'trustedBonus', label: 'Trusted bonus', min: 0, max: 1000 },
  { key: 'remakePenalty', label: 'Remake penalty', min: -1000, max: 0 },
  { key: 'minSeeders', label: 'Minimum seeders to grab', min: 0, max: 10000 },
];

function SectionTitle({ children }: { children: string }) {
  const t = useTokens();
  return (
    <Text style={[text.displaySm, { color: t.text, marginTop: 22, marginBottom: 10 }]}>
      {children}
    </Text>
  );
}

// Renders the inline alert for an auto-replay result, if any.
function ReplayResult({
  result,
}: {
  result: { runId: number } | { error: string } | undefined;
}) {
  if (result === undefined) return null;
  if ('runId' in result) {
    return (
      <InlineAlert
        tone="info"
        body={`Replay queued (#${result.runId})`}
        testID="matcher-replay-result"
      />
    );
  }
  return (
    <InlineAlert
      tone="warn"
      body={`Replay couldn't be queued: ${result.error}`}
      testID="matcher-replay-result"
    />
  );
}

// ── Weights section ──────────────────────────────────────────────────────────
function WeightsForm({ initial }: { initial: MatcherWeights }) {
  const save = useSaveMatcherWeights();
  const { gate, disabledProps } = useOnlineGate();

  const seed = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const w of WEIGHTS) out[w.key] = String(initial[w.key]);
    return out;
  };
  const [draft, setDraft] = useState<Record<string, string>>(seed);

  const parsed = WEIGHTS.map((w) => ({
    def: w,
    result: parseIntInRange(draft[w.key] ?? '', w.min, w.max),
  }));

  const hasError = parsed.some((p) => !p.result.ok);
  const dirty = WEIGHTS.some((w) => draft[w.key] !== String(initial[w.key]));

  const onSave = () => {
    const body: Partial<Record<keyof MatcherWeights, number>> = {};
    for (const p of parsed) {
      if (!p.result.ok) return;
      body[p.def.key] = p.result.value;
    }
    save.mutate(body as MatcherWeights);
  };

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Scoring weights</SectionTitle>
      {WEIGHTS.map((w) => {
        const r = parseIntInRange(draft[w.key] ?? '', w.min, w.max);
        return (
          <TextField
            key={w.key}
            testID={`matcher-weight-${w.key}`}
            label={w.label}
            value={draft[w.key] ?? ''}
            onChangeText={(next) => setDraft((d) => ({ ...d, [w.key]: next }))}
            // remakePenalty needs a typeable minus sign.
            keyboardType={w.min < 0 ? 'numbers-and-punctuation' : 'number-pad'}
            {...(r.ok ? { helper: `Range ${w.min}–${w.max}` } : { error: r.error })}
          />
        );
      })}
      {save.isError ? (
        <InlineAlert tone="err" body="Couldn't save the weights." testID="matcher-weights-save-error" />
      ) : null}
      <ReplayResult result={save.data?.autoReplayEnqueued} />
      <Button
        testID="matcher-weights-save"
        label={save.isPending ? 'Saving…' : 'Save weights'}
        onPress={gate(onSave)}
        disabled={!dirty || hasError || save.isPending || disabledProps.disabled}
      />
    </View>
  );
}

// ── Adult filter section ─────────────────────────────────────────────────────
function AdultFilterForm({ initial }: { initial: AdultFilter }) {
  const save = useSaveAdultFilter();
  const { gate, disabledProps } = useOnlineGate();
  const t = useTokens();

  const [enabled, setEnabled] = useState(initial.enabled);
  const [categories, setCategories] = useState<string[]>(initial.blockedCategories);

  const dirty =
    enabled !== initial.enabled ||
    categories.length !== initial.blockedCategories.length ||
    categories.some((c, i) => c !== initial.blockedCategories[i]);

  const onSave = () => {
    save.mutate({ enabled, blockedCategories: categories });
  };

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Adult content filter</SectionTitle>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Text style={[text.body, { flex: 1, color: t.text }]}>
          Block releases tagged as adult
        </Text>
        <Toggle testID="matcher-adult-enabled" on={enabled} onChange={setEnabled} />
      </View>
      <TagTokenInput
        testID="matcher-adult-categories"
        label="Blocked categories"
        value={categories}
        onChange={setCategories}
        placeholder="Add a category…"
        helper="Type a category and press enter or comma"
      />
      {save.isError ? (
        <InlineAlert tone="err" body="Couldn't save the adult filter." testID="matcher-adult-save-error" />
      ) : null}
      <ReplayResult result={save.data?.autoReplayEnqueued} />
      <Button
        testID="matcher-adult-save"
        label={save.isPending ? 'Saving…' : 'Save filter'}
        onPress={gate(onSave)}
        disabled={!dirty || save.isPending || disabledProps.disabled}
      />
    </View>
  );
}

function MatcherAdminView() {
  const t = useTokens();
  const q = useMatcher();
  const data: MatcherOverview | undefined = q.data;
  const online = useIsOnline();
  // Tapping a replay run opens its detail as a bottom sheet — the same
  // pattern the Audit screen uses for event details.
  const [selectedRun, setSelectedRun] = useState<ReplayRun | null>(null);

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
          body="Couldn't load matcher settings."
          testID="matcher-load-error"
        />
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4 }}>
        <WeightsForm initial={data.weights} />
        <AdultFilterForm initial={data.adultFilter} />
        <ReplayHistorySection onOpenRun={setSelectedRun} />
      </ScrollView>
      {selectedRun ? (
        // Absolute-fill host (EditIndexerSheet pattern): a BottomSheet rendered
        // as a plain flex sibling of the ScrollView gets squashed to the
        // leftover height — on-device only the drag handle peeked above the tab
        // bar and the sheet never visually opened (e2e job 2882 screenshot).
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <ReplayRunDetailSheet run={selectedRun} onDismiss={() => setSelectedRun(null)} />
        </View>
      ) : null}
    </>
  );
}

export default function Matcher() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-matcher">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-matcher" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Matcher</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Matcher settings require an administrator account."
            testID="matcher-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <MatcherAdminView />
      ) : null}
    </ScreenContainer>
  );
}
