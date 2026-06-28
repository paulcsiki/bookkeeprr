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
import { text } from '@/theme/typography';
import { useMe, useAutoGrab, useSaveAutoGrab } from '@/api/hooks';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

function AutoGrabAdminView() {
  const t = useTokens();
  const q = useAutoGrab();
  const save = useSaveAutoGrab();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const config = q.data;
  const [dryRun, setDryRun] = useState<boolean | null>(null);

  // Seed the editable draft once the config loads.
  useEffect(() => {
    if (config && dryRun === null) setDryRun(config.dryRun);
  }, [config, dryRun]);

  if (!online && q.data === undefined) return <SettingsOfflineState />;
  if (q.isLoading || config === undefined || dryRun === null) {
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
          body="Couldn't load auto-grab settings."
          testID="autograb-load-error"
        />
      </View>
    );
  }

  const dirty = dryRun !== config.dryRun;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 4 }}>
      <View style={{ marginTop: 8, gap: 4 }}>
        <FormField
          label="Dry run"
          helper="When enabled, auto-grab evaluates and logs candidate releases but never sends them to the downloader."
          trailing={
            <Toggle testID="autograb-dryrun" on={dryRun} onChange={(next) => setDryRun(next)} />
          }
        />
      </View>

      {save.isError ? (
        <View style={{ marginTop: 12 }}>
          <InlineAlert
            tone="err"
            body="Couldn't save auto-grab settings."
            testID="autograb-save-error"
          />
        </View>
      ) : null}

      <Button
        testID="autograb-save"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={gate(() => save.mutate({ dryRun }))}
        disabled={!dirty || save.isPending || disabledProps.disabled}
        style={{ marginTop: 16 }}
      />
    </ScrollView>
  );
}

export default function AutoGrab() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-auto-grab">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-auto-grab" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Auto-Grab</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Auto-grab settings require an administrator account."
            testID="autograb-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <AutoGrabAdminView />
      ) : null}
    </ScreenContainer>
  );
}
