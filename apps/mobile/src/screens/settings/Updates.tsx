import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Toggle } from '@/components/Toggle';
import { FormField } from '@/components/FormField';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import {
  useMe,
  useUpdatesSettings,
  useUpdateUpdatesSettings,
  useCheckUpdates,
  useSetDeploymentMode,
  type DeploymentMode,
} from '@/api/hooks';
import type { UpdatesConfig } from '@/api/schemas';
import { AppConfig } from '@/lib/appConfig';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

const FREQUENCIES: UpdatesConfig['frequency'][] = ['off', 'hourly', 'daily', 'weekly'];
const FREQ_LABELS: Record<UpdatesConfig['frequency'], string> = {
  off: 'Off',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
};

const BEHAVIORS: UpdatesConfig['behavior'][] = ['notify', 'auto-download', 'auto-install'];
const BEHAVIOR_LABELS: Record<UpdatesConfig['behavior'], string> = {
  notify: 'Notify',
  'auto-download': 'Auto-download',
  'auto-install': 'Auto-install',
};

const DEPLOY_MODES: DeploymentMode[] = ['auto', 'docker', 'kubernetes'];
const DEPLOY_LABELS: Record<DeploymentMode, string> = {
  auto: 'Auto',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
};

// Solid-background segmented control: selected = solid primary, unselected =
// solid surfaceMuted (never translucent), per the design system.
function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
  testIDPrefix,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  labels: Record<T, string>;
  testIDPrefix: string;
}) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <Pressable
            key={opt}
            testID={`${testIDPrefix}-${opt}`}
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
              {labels[opt]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={[text.label, { color: t.textMuted }]}>{label}</Text>
      <Text style={[text.mono, { color: t.text, flexShrink: 1, textAlign: 'right' }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  const t = useTokens();
  return (
    <Text style={[text.displaySm, { color: t.text, marginTop: 20, marginBottom: 10 }]}>
      {children}
    </Text>
  );
}

function UpdatesAdminView() {
  const t = useTokens();
  const q = useUpdatesSettings();
  const update = useUpdateUpdatesSettings();
  const check = useCheckUpdates();
  const setMode = useSetDeploymentMode();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const overview = q.data;
  const config = overview?.config;

  const [draft, setDraft] = useState<UpdatesConfig | null>(null);
  // Deployment-mode control reflects the server's effective mode on load, then
  // the user's selection after tapping. Seed once from overview.deploymentMode.
  const [mode, setModeLocal] = useState<DeploymentMode | null>(null);

  // Seed the editable draft + deployment mode once the overview loads.
  useEffect(() => {
    if (config && draft === null) setDraft(config);
  }, [config, draft]);
  useEffect(() => {
    if (overview && mode === null) setModeLocal(overview.deploymentMode);
  }, [overview, mode]);

  if (!online && q.data === undefined) return <SettingsOfflineState />;
  if (q.isLoading || overview === undefined || config === undefined || draft === null) {
    return (
      <Text style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}>
        Loading…
      </Text>
    );
  }
  if (q.isError) {
    return (
      <View style={{ paddingTop: 8 }}>
        <InlineAlert tone="err" body="Couldn't load update settings." testID="updates-load-error" />
      </View>
    );
  }

  // PATCH only the fields that diverge from the persisted config.
  const dirtyPatch: Partial<UpdatesConfig> = {};
  if (draft.frequency !== config.frequency) dirtyPatch.frequency = draft.frequency;
  if (draft.behavior !== config.behavior) dirtyPatch.behavior = draft.behavior;
  if (draft.notifyOnIntegrations !== config.notifyOnIntegrations)
    dirtyPatch.notifyOnIntegrations = draft.notifyOnIntegrations;
  if (draft.showChangelogOnFirstLaunch !== config.showChangelogOnFirstLaunch)
    dirtyPatch.showChangelogOnFirstLaunch = draft.showChangelogOnFirstLaunch;
  const dirty = Object.keys(dirtyPatch).length > 0;

  const checkResult = check.data;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 4 }}>
      {/* ── Read-only build / runtime / version (from GET /api/updates) ── */}
      <View
        style={{
          gap: 10,
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.surfaceMuted,
        }}
      >
        <InfoRow label="App version" value={AppConfig.versionLabel} />
        <InfoRow label="Server version" value={overview.buildInfo.version} />
        <InfoRow label="Commit" value={overview.buildInfo.commit} />
        <InfoRow label="Built" value={overview.buildInfo.builtAt} />
        <InfoRow label="Runtime" value={overview.buildInfo.runtime} />
        {overview.updateAvailable ? (
          <Text style={[text.bodySm, { color: t.primary }]} testID="updates-app-available">
            An update is available.
          </Text>
        ) : null}
      </View>

      {/* ── Check now ── */}
      <SectionTitle>Check for updates</SectionTitle>
      <Button
        testID="updates-check-now"
        label={check.isPending ? 'Checking…' : 'Check now'}
        variant="secondary"
        onPress={gate(() => check.mutate())}
        disabled={check.isPending || disabledProps.disabled}
      />
      {checkResult?.kind === 'state' ? (
        checkResult.state.fetchError ? (
          <View style={{ marginTop: 10 }}>
            <InlineAlert
              tone="err"
              body={checkResult.state.fetchError}
              testID="updates-check-error"
            />
          </View>
        ) : (
          <Text
            style={[text.bodySm, { color: t.text, marginTop: 10 }]}
            testID="updates-check-latest"
          >
            Latest version: {checkResult.state.latestVersion ?? 'unknown'}
          </Text>
        )
      ) : null}
      {checkResult?.kind === 'rate-limited' ? (
        <View style={{ marginTop: 10 }}>
          <InlineAlert
            tone="info"
            body={`Checked recently — try again in ${checkResult.retryAfterSeconds}s.`}
            testID="updates-check-ratelimit"
          />
        </View>
      ) : null}

      {/* ── Frequency ── */}
      <SectionTitle>Frequency</SectionTitle>
      <Segmented
        options={FREQUENCIES}
        value={draft.frequency}
        onChange={(frequency) => setDraft({ ...draft, frequency })}
        labels={FREQ_LABELS}
        testIDPrefix="updates-frequency"
      />

      {/* ── Behavior ── */}
      <SectionTitle>Behavior</SectionTitle>
      <Segmented
        options={BEHAVIORS}
        value={draft.behavior}
        onChange={(behavior) => setDraft({ ...draft, behavior })}
        labels={BEHAVIOR_LABELS}
        testIDPrefix="updates-behavior"
      />

      {/* ── Toggles ── */}
      <View style={{ marginTop: 16, gap: 4 }}>
        <FormField
          label="Show changelog on first launch"
          trailing={
            <Toggle
              testID="updates-toggle-changelog"
              on={draft.showChangelogOnFirstLaunch}
              onChange={(showChangelogOnFirstLaunch) =>
                setDraft({ ...draft, showChangelogOnFirstLaunch })
              }
            />
          }
        />
        <FormField
          label="Notify on integration updates"
          trailing={
            <Toggle
              testID="updates-toggle-integrations"
              on={draft.notifyOnIntegrations}
              onChange={(notifyOnIntegrations) => setDraft({ ...draft, notifyOnIntegrations })}
            />
          }
        />
      </View>

      {update.isError ? (
        <View style={{ marginTop: 12 }}>
          <InlineAlert tone="err" body="Couldn't save update settings." testID="updates-save-error" />
        </View>
      ) : null}

      <Button
        testID="updates-save"
        label={update.isPending ? 'Saving…' : 'Save'}
        onPress={gate(() => update.mutate(dirtyPatch))}
        disabled={!dirty || update.isPending || disabledProps.disabled}
        style={{ marginTop: 16 }}
      />

      {/* ── Advanced: deployment mode ── */}
      <SectionTitle>Advanced</SectionTitle>
      <FormField
        label="Deployment mode"
        helper="Override platform detection for update behaviour."
      >
        <View style={{ marginTop: 8 }}>
          <Segmented
            options={DEPLOY_MODES}
            value={mode ?? overview.deploymentMode}
            onChange={gate((next: DeploymentMode) => {
              setModeLocal(next);
              setMode.mutate(next);
            })}
            labels={DEPLOY_LABELS}
            testIDPrefix="updates-deployment"
          />
        </View>
      </FormField>
      {setMode.isError ? (
        <View style={{ marginTop: 10 }}>
          <InlineAlert tone="err" body="Couldn't set deployment mode." testID="updates-deployment-error" />
        </View>
      ) : null}
    </ScrollView>
  );
}

export default function Updates() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-updates">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-updates" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Updates</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Update settings require an administrator account."
            testID="updates-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <UpdatesAdminView />
      ) : null}
    </ScreenContainer>
  );
}
