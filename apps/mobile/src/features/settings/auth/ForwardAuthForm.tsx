import { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { TextField } from '@/components/TextField';
import { TagTokenInput } from '@/components/TagTokenInput';
import { FormField } from '@/components/FormField';
import { Toggle } from '@/components/Toggle';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import {
  useForwardAuthConfig,
  useUpdateForwardAuthConfig,
  useValidateForwardAuth,
} from '@/api/hooks';
import { ApiError } from '@/api/client';
import { type ForwardAuthConfig, ForwardAuthValidateResult } from '@/api/schemas';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

type SaveError =
  | { kind: 'invalid_cidr'; invalidCidrs: string[] }
  | { kind: 'gate'; validate: ForwardAuthValidateResult }
  | { kind: 'other'; message: string };

function parseSaveError(e: unknown): SaveError {
  if (e instanceof ApiError && e.body && typeof e.body === 'object') {
    const body = e.body as Record<string, unknown>;
    if (body.error === 'invalid_cidr') {
      const invalidCidrs = Array.isArray(body.invalidCidrs)
        ? body.invalidCidrs.filter((c): c is string => typeof c === 'string')
        : [];
      return { kind: 'invalid_cidr', invalidCidrs };
    }
    const validate = ForwardAuthValidateResult.safeParse(e.body);
    if (validate.success) return { kind: 'gate', validate: validate.data };
  }
  return { kind: 'other', message: e instanceof Error ? e.message : 'Save failed' };
}

export function ForwardAuthForm() {
  const t = useTokens();
  const q = useForwardAuthConfig();
  const save = useUpdateForwardAuthConfig();
  const validate = useValidateForwardAuth();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();
  const [form, setForm] = useState<ForwardAuthConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);

  useEffect(() => {
    if (q.data && !form) setForm(q.data.config);
  }, [q.data, form]);

  if (!online && q.data?.config === undefined) return <SettingsOfflineState />;
  if (!form) {
    return (
      <Text testID="fwd-loading" style={[text.bodySm, { color: t.textMuted, padding: 24 }]}>
        Loading…
      </Text>
    );
  }

  const set = <K extends keyof ForwardAuthConfig>(k: K, v: ForwardAuthConfig[K]) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));

  // Mirror the webapp gate: the enable Toggle is locked until the most recent
  // validation reports the proxy + user header are wired up (ready: true).
  const ready = validate.data?.ready === true;
  const enableLocked = !ready;

  async function onSave() {
    if (!form) return;
    setSaveError(null);
    setSaved(false);
    try {
      await save.mutateAsync({ ...form });
      setSaved(true);
    } catch (e) {
      setSaveError(parseSaveError(e));
    }
  }

  return (
    <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
      <FormField
        label="Enable forward auth"
        {...(enableLocked ? { helper: 'Validate the connection before enabling.' } : {})}
        trailing={
          <View style={{ opacity: enableLocked ? 0.45 : 1 }}>
            <Toggle
              testID="fwd-enabled"
              on={form.enabled}
              onChange={(v) => {
                if (!enableLocked) set('enabled', v);
              }}
            />
          </View>
        }
      />
      <TagTokenInput
        testID="fwd-trusted-proxies"
        label="Trusted proxies"
        value={form.trustedProxies}
        onChange={(v) => set('trustedProxies', v)}
        helper="CIDR — IPv4/IPv6"
      />
      <TextField
        testID="fwd-user-header"
        label="User header"
        value={form.userHeader}
        onChangeText={(v) => set('userHeader', v)}
      />
      <TextField
        testID="fwd-email-header"
        label="Email header"
        value={form.emailHeader}
        onChangeText={(v) => set('emailHeader', v)}
      />
      <TextField
        testID="fwd-groups-header"
        label="Groups header"
        value={form.groupsHeader}
        onChangeText={(v) => set('groupsHeader', v)}
      />
      <TagTokenInput
        testID="fwd-allowed-groups"
        label="Allowed groups"
        value={form.allowedGroups}
        onChange={(v) => set('allowedGroups', v)}
        helper="Empty = any authenticated user"
      />
      <TagTokenInput
        testID="fwd-admin-groups"
        label="Admin groups"
        value={form.adminGroups}
        onChange={(v) => set('adminGroups', v)}
      />
      <FormField
        label="Auto-create users on first login"
        trailing={
          <Toggle
            testID="fwd-auto-create"
            on={form.autoCreateUsers}
            onChange={(v) => set('autoCreateUsers', v)}
          />
        }
      />
      {validate.data ? (
        <InlineAlert
          testID="fwd-validate-result"
          tone={validate.data.ready ? 'info' : 'err'}
          title={validate.data.ready ? 'Connection ready' : 'Not ready'}
          body={[
            `peer: ${validate.data.peerIp ?? '—'}`,
            `trusted: ${validate.data.peerInTrustedProxies ? 'yes' : 'no'}`,
            `user header: ${validate.data.userHeaderPresent ? 'present' : 'missing'}`,
          ].join('  ·  ')}
        />
      ) : null}
      {saveError?.kind === 'invalid_cidr' ? (
        <InlineAlert
          testID="fwd-save-error"
          tone="err"
          title="Invalid CIDR"
          body={
            saveError.invalidCidrs.length
              ? saveError.invalidCidrs.join(', ')
              : 'One or more trusted proxies are not valid CIDR ranges.'
          }
        />
      ) : null}
      {saveError?.kind === 'gate' ? (
        <InlineAlert
          testID="fwd-save-error"
          tone="err"
          title="Cannot enable forward auth"
          body={[
            `peer: ${saveError.validate.peerIp ?? '—'}`,
            `trusted: ${saveError.validate.peerInTrustedProxies ? 'yes' : 'no'}`,
            `user header: ${saveError.validate.userHeaderPresent ? 'present' : 'missing'}`,
          ].join('  ·  ')}
        />
      ) : null}
      {saveError?.kind === 'other' ? (
        <InlineAlert testID="fwd-save-error" tone="err" body={saveError.message} />
      ) : null}
      {saved ? <InlineAlert tone="info" body="Saved." testID="fwd-saved" /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          testID="fwd-validate"
          label={validate.isPending ? 'Validating…' : 'Validate connection'}
          variant="secondary"
          onPress={gate(() =>
            validate.mutate({ trustedProxies: form.trustedProxies, userHeader: form.userHeader }),
          )}
          disabled={validate.isPending || disabledProps.disabled}
          style={{ flex: 1 }}
        />
        <Button
          testID="fwd-save"
          label={save.isPending ? 'Saving…' : 'Save'}
          onPress={gate(onSave)}
          disabled={save.isPending || disabledProps.disabled}
          style={{ flex: 1 }}
        />
      </View>
    </ScrollView>
  );
}
