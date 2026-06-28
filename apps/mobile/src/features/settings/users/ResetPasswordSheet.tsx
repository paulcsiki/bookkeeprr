import { useState } from 'react';
import { View, Text } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { TextField } from '@/components/TextField';
import { FormField } from '@/components/FormField';
import { Toggle } from '@/components/Toggle';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useResetUserPassword } from '@/api/hooks';
import { validatePassword } from '@/api/schemas';
import { ApiError } from '@/api/client';
import type { UserRow } from '@/api/schemas';
import { useOnlineGate } from '@/features/system/online';

/**
 * Bottom sheet to reset one user's password. Validates min-8 client-side, then
 * POSTs the new password; the "force change" toggle defaults on.
 */
export function ResetPasswordSheet({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const t = useTokens();
  const reset = useResetUserPassword();
  const { gate, disabledProps } = useOnlineGate();
  const [password, setPassword] = useState('');
  const [must, setMust] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    const pe = validatePassword(password);
    setPwErr(pe);
    if (pe) return;
    try {
      await reset.mutateAsync({ id: user.id, newPassword: password, mustChangePassword: must });
      onDone();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? ((e.body as { message?: string })?.message ?? 'Could not reset password')
          : 'Could not reset password',
      );
    }
  }

  return (
    <BottomSheet testID="reset-password-sheet" onDismiss={onDone}>
      <View style={{ gap: 14 }}>
        <Text style={[text.displaySm, { color: t.text }]}>Reset password</Text>
        <Text style={[text.bodySm, { color: t.textMuted }]}>@{user.username}</Text>
        {err ? <InlineAlert tone="err" body={err} testID="reset-password-error" /> : null}
        <TextField
          testID="rp-password"
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          helper="At least 8 characters"
          {...(pwErr ? { error: pwErr } : {})}
        />
        <FormField
          label="Force password change on next login"
          trailing={<Toggle testID="rp-must" on={must} onChange={setMust} />}
        />
        <Button
          testID="rp-submit"
          label={reset.isPending ? 'Saving…' : 'Save'}
          onPress={gate(submit)}
          disabled={reset.isPending || disabledProps.disabled}
        />
        <Button testID="rp-cancel" label="Cancel" variant="ghost" onPress={onDone} />
      </View>
    </BottomSheet>
  );
}
