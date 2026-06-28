import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useMe, useFlaresolverr, useSaveFlaresolverr, useTestFlaresolverr } from '@/api/hooks';
import type { KeyTestResult } from '@/api/schemas';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

function FlareSolverrAdminView() {
  const t = useTokens();
  const q = useFlaresolverr();
  const save = useSaveFlaresolverr();
  const testMut = useTestFlaresolverr();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const config = q.data;

  const [url, setUrl] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [testResult, setTestResult] = useState<KeyTestResult | null>(null);

  // Seed editable draft once the config loads (only on first load).
  useEffect(() => {
    if (config && !seeded) {
      setUrl(config.url);
      setSeeded(true);
    }
  }, [config, seeded]);

  if (!online && q.data === undefined) return <SettingsOfflineState />;
  if (q.isLoading || config === undefined || !seeded) {
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
          body="Couldn't load FlareSolverr settings."
          testID="fs-load-error"
        />
      </View>
    );
  }

  const dirty = url !== config.url;
  const canSave = dirty && !save.isPending;

  function onSave() {
    save.mutate(
      { url },
      {
        onSuccess: () => {
          setSeeded(false); // Re-seed from the next GET.
        },
      },
    );
  }

  function onTest() {
    const trimmed = url.trim();
    testMut.mutate(
      trimmed.length > 0 ? { url: trimmed } : {},
      {
        onSuccess: (result) => setTestResult(result),
        onError: () =>
          setTestResult({ ok: false, error: 'Connection test failed unexpectedly.' }),
      },
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4 }}>
      <View style={{ marginTop: 8, gap: 14 }}>
        <TextField
          testID="fs-url"
          label="URL"
          value={url}
          onChangeText={(v) => { setUrl(v); setTestResult(null); }}
          placeholder="http://flaresolverr:8191"
          helper="e.g. http://flaresolverr:8191"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {save.isError ? (
        <View style={{ marginTop: 14 }}>
          <InlineAlert
            tone="err"
            body="Couldn't save FlareSolverr settings."
            testID="fs-save-error"
          />
        </View>
      ) : null}

      <Button
        testID="fs-save"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={gate(onSave)}
        disabled={!canSave || disabledProps.disabled}
        style={{ marginTop: 16 }}
      />

      <Button
        testID="fs-test"
        label={testMut.isPending ? 'Testing…' : 'Test Connection'}
        variant="secondary"
        onPress={gate(onTest)}
        disabled={testMut.isPending || disabledProps.disabled}
        style={{ marginTop: 10 }}
      />

      {testResult !== null ? (
        <View style={{ marginTop: 14 }}>
          <InlineAlert
            testID="fs-test-result"
            tone={testResult.ok ? 'info' : 'err'}
            body={
              testResult.ok
                ? 'Connection successful.'
                : (testResult.error ?? 'Connection test failed.')
            }
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

export default function FlareSolverr() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-flaresolverr">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-flaresolverr" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>FlareSolverr</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="FlareSolverr settings require an administrator account."
            testID="fs-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <FlareSolverrAdminView />
      ) : null}
    </ScreenContainer>
  );
}
