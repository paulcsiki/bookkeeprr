import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useApiKey, useMutateApiKey, useTestApiKey } from '@/api/hooks';
import type { ApiKeyTestResult } from '@/api/schemas';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

/** Simple relative-time formatter (no external dep). */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ApiKeyPanel() {
  const t = useTokens();
  const q = useApiKey();
  const mutate = useMutateApiKey();
  const testKey = useTestApiKey();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const [revealed, setRevealed] = useState(false);
  const [disableConfirm, setDisableConfirm] = useState(false);
  const [testResult, setTestResult] = useState<ApiKeyTestResult | null>(null);

  const data = q.data;

  async function handleGenerate() {
    setDisableConfirm(false);
    await mutate.mutateAsync('generate');
    setRevealed(false);
  }

  async function handleDisable() {
    if (!disableConfirm) {
      setDisableConfirm(true);
      return;
    }
    setDisableConfirm(false);
    await mutate.mutateAsync('disable');
    setRevealed(false);
  }

  async function handleTest() {
    const result = await testKey.mutateAsync();
    setTestResult(result);
  }

  // After a mutation, the query cache is updated via onSuccess; use mutate.data if it
  // was just updated, else fall back to query data.
  const liveData = mutate.data ?? data;
  const liveEnabled = liveData?.enabled ?? false;
  const liveKey = liveData?.key ?? '';
  const liveCreatedAt = liveData?.createdAt ?? null;

  const maskedKey = liveKey ? '••••••••••••••••' : '';
  const displayKey = revealed ? liveKey : maskedKey;

  if (!online && data === undefined && mutate.data === undefined) return <SettingsOfflineState />;

  return (
    <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
      {/* Header note */}
      <View
        style={{
          backgroundColor: t.surfaceMuted,
          borderRadius: 10,
          padding: 12,
        }}
      >
        <Text style={[text.bodySm, { color: t.textMuted, lineHeight: 18 }]}>
          Every <Text style={{ fontFamily: fonts.mono.regular }}>/api/*</Text> request must include{' '}
          <Text style={{ fontFamily: fonts.mono.regular }}>X-Api-Key: {'<key>'}</Text>
        </Text>
      </View>

      {/* Status badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={[text.label, { color: t.textMuted }]}>Status</Text>
        <View
          testID="apikey-status"
          style={{
            backgroundColor: liveEnabled ? t.primary : t.surfaceMuted,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 6,
          }}
        >
          <Text
            style={[
              text.monoSm,
              {
                color: liveEnabled ? t.primaryFg : t.textMuted,
                fontFamily: fonts.mono.regular,
                letterSpacing: 0.5,
              },
            ]}
          >
            {liveEnabled ? 'ENABLED' : 'OFF'}
          </Text>
        </View>
      </View>

      {/* Key display — only when enabled */}
      {liveEnabled && liveKey ? (
        <View style={{ gap: 8 }}>
          <Text style={[text.label, { color: t.textMuted }]}>API key</Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: t.surface,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.border,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Text
              testID="apikey-value"
              selectable
              numberOfLines={1}
              style={[
                text.mono,
                {
                  flex: 1,
                  color: t.text,
                  fontFamily: fonts.mono.regular,
                },
              ]}
            >
              {displayKey}
            </Text>
            <Pressable
              testID="apikey-reveal"
              onPress={() => setRevealed((r) => !r)}
              hitSlop={8}
              accessibilityLabel={revealed ? 'Hide key' : 'Reveal key'}
            >
              {revealed ? (
                <EyeOff size={16} color={t.textMuted} strokeWidth={1.75} />
              ) : (
                <Eye size={16} color={t.textMuted} strokeWidth={1.75} />
              )}
            </Pressable>
          </View>
          {liveCreatedAt ? (
            <Text style={[text.monoSm, { color: t.textMuted }]}>
              Generated {relativeTime(liveCreatedAt)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Actions */}
      <View style={{ gap: 10 }}>
        {!liveEnabled ? (
          <Button
            testID="apikey-generate"
            label={mutate.isPending ? 'Generating…' : 'Generate key'}
            onPress={gate(handleGenerate)}
            disabled={mutate.isPending || disabledProps.disabled}
          />
        ) : (
          <Button
            testID="apikey-generate"
            label={mutate.isPending ? 'Rotating…' : 'Rotate key'}
            variant="secondary"
            onPress={gate(handleGenerate)}
            disabled={mutate.isPending || disabledProps.disabled}
          />
        )}

        {liveEnabled ? (
          <Button
            testID="apikey-disable"
            label={
              mutate.isPending
                ? 'Disabling…'
                : disableConfirm
                  ? 'Tap again to confirm'
                  : 'Disable'
            }
            variant={disableConfirm ? 'primary' : 'ghost'}
            onPress={gate(handleDisable)}
            disabled={mutate.isPending || disabledProps.disabled}
          />
        ) : null}

        {liveEnabled ? (
          <Button
            testID="apikey-test"
            label={testKey.isPending ? 'Testing…' : 'Test'}
            variant="secondary"
            onPress={gate(handleTest)}
            disabled={testKey.isPending || disabledProps.disabled}
          />
        ) : null}
      </View>

      {/* Test result */}
      {testResult ? (
        <InlineAlert
          testID="apikey-test-result"
          tone={testResult.ok ? 'info' : 'err'}
          title={testResult.ok ? 'Key is valid' : 'Key is invalid'}
          body={testResult.note ?? testResult.error ?? (testResult.ok ? 'Authentication succeeded.' : 'Authentication failed.')}
        />
      ) : null}

      {/* Mutation error */}
      {mutate.isError ? (
        <InlineAlert
          testID="apikey-mutate-error"
          tone="err"
          body="Could not update the API key. Please try again."
        />
      ) : null}
    </ScrollView>
  );
}
