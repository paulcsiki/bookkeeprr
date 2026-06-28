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
import { useOidcConfig, useUpdateOidcConfig, useTestOidc } from '@/api/hooks';
import { OIDC_SECRET_SENTINEL, type OidcConfig } from '@/api/schemas';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

export function OidcForm() {
  const t = useTokens();
  const q = useOidcConfig();
  const save = useUpdateOidcConfig();
  const test = useTestOidc();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();
  const [form, setForm] = useState<OidcConfig | null>(null);
  const [secretTouched, setSecretTouched] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (q.data && !form) setForm(q.data.config);
  }, [q.data, form]);

  if (!online && q.data?.config === undefined) return <SettingsOfflineState />;
  if (!form) {
    return (
      <Text testID="oidc-loading" style={[text.bodySm, { color: t.textMuted, padding: 24 }]}>
        Loading…
      </Text>
    );
  }

  const set = <K extends keyof OidcConfig>(k: K, v: OidcConfig[K]) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));

  async function onSave() {
    if (!form) return;
    const patch: Partial<OidcConfig> = { ...form };
    if (!secretTouched) delete patch.clientSecret;
    await save.mutateAsync(patch);
    setSaved(true);
  }

  const testOk = test.data?.ok === true ? test.data : null;
  const testErr = test.data && test.data.ok === false ? test.data : null;

  return (
    <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
      <FormField
        label="Enable OIDC"
        trailing={
          <Toggle testID="oidc-enabled" on={form.enabled} onChange={(v) => set('enabled', v)} />
        }
      />
      <TextField
        testID="oidc-issuer"
        label="Issuer URL"
        value={form.issuer}
        onChangeText={(v) => set('issuer', v)}
        keyboardType="url"
        placeholder="https://auth.example.com/application/o/app/"
      />
      <TextField
        testID="oidc-client-id"
        label="Client ID"
        value={form.clientId}
        onChangeText={(v) => set('clientId', v)}
      />
      <TextField
        testID="oidc-secret"
        label="Client secret"
        value={form.clientSecret}
        secureTextEntry
        onChangeText={(v) => {
          setSecretTouched(true);
          set('clientSecret', v);
        }}
        helper="Leave unchanged to keep the current secret"
      />
      <TagTokenInput
        testID="oidc-scopes"
        label="Scopes"
        value={form.scopes}
        onChange={(v) => set('scopes', v)}
      />
      <TextField
        testID="oidc-button-label"
        label="Button label"
        value={form.buttonLabel}
        onChangeText={(v) => set('buttonLabel', v)}
      />
      <TextField
        testID="oidc-username-claim"
        label="Username claim"
        value={form.usernameClaim}
        onChangeText={(v) => set('usernameClaim', v)}
      />
      <TextField
        testID="oidc-email-claim"
        label="Email claim"
        value={form.emailClaim}
        onChangeText={(v) => set('emailClaim', v)}
      />
      <TextField
        testID="oidc-groups-claim"
        label="Groups claim"
        value={form.groupsClaim}
        onChangeText={(v) => set('groupsClaim', v)}
      />
      <TagTokenInput
        testID="oidc-allowed-groups"
        label="Allowed groups"
        value={form.allowedGroups}
        onChange={(v) => set('allowedGroups', v)}
        helper="Empty = any authenticated user"
      />
      <TagTokenInput
        testID="oidc-admin-groups"
        label="Admin groups"
        value={form.adminGroups}
        onChange={(v) => set('adminGroups', v)}
      />
      <FormField
        label="Auto-create users on first login"
        trailing={
          <Toggle
            testID="oidc-auto-create"
            on={form.autoCreateUsers}
            onChange={(v) => set('autoCreateUsers', v)}
          />
        }
      />
      {testOk ? (
        <InlineAlert
          tone="info"
          title="Discovery ok"
          body={`token: ${testOk.tokenEndpoint ?? '—'}`}
        />
      ) : null}
      {testErr ? (
        <InlineAlert tone="err" title="Discovery failed" body={testErr.detail ?? testErr.error} />
      ) : null}
      {saved ? <InlineAlert tone="info" body="Saved." testID="oidc-saved" /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          testID="oidc-test"
          label={test.isPending ? 'Testing…' : 'Test connection'}
          variant="secondary"
          onPress={gate(() =>
            test.mutate({
              issuer: form.issuer,
              clientId: form.clientId,
              clientSecret: form.clientSecret || OIDC_SECRET_SENTINEL,
            }),
          )}
          disabled={test.isPending || disabledProps.disabled}
          style={{ flex: 1 }}
        />
        <Button
          testID="oidc-save"
          label={save.isPending ? 'Saving…' : 'Save'}
          onPress={gate(onSave)}
          disabled={save.isPending || disabledProps.disabled}
          style={{ flex: 1 }}
        />
      </View>
    </ScrollView>
  );
}
