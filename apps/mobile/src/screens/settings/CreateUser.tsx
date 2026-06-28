import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TextField } from '@/components/TextField';
import { FormField } from '@/components/FormField';
import { Radio } from '@/components/Radio';
import { Toggle } from '@/components/Toggle';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useCreateUser } from '@/api/hooks';
import { validatePassword } from '@/api/schemas';
import { ApiError } from '@/api/client';
import type { SettingsStackParamList } from '@/navigation/types';
import { useOnlineGate } from '@/features/system/online';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'CreateUser'>;

/**
 * Full-screen form to create a new local user. Validates the password
 * client-side (mirrors the server min-8 policy) before POSTing, and surfaces
 * server 409s (e.g. "Username already exists") inline. Pushed onto the
 * SettingsStack; pops back on success or cancel.
 */
export default function CreateUser() {
  const t = useTokens();
  const nav = useNavigation<Nav>();
  const create = useCreateUser();
  const { gate, disabledProps } = useOnlineGate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [must, setMust] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    const pe = validatePassword(password);
    setPwErr(pe);
    if (!username.trim() || pe) return;
    try {
      await create.mutateAsync({
        username: username.trim(),
        password,
        role,
        mustChangePassword: must,
      });
      nav.goBack();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? ((e.body as { message?: string })?.message ?? 'Could not create user')
          : 'Could not create user',
      );
    }
  }

  return (
    <ScreenContainer testID="screen-create-user">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-create-user" onPress={() => nav.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Add User</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 4, paddingTop: 6, paddingBottom: 48, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        {err ? <InlineAlert tone="err" body={err} testID="create-user-error" /> : null}
        <TextField
          testID="cu-username"
          label="Username"
          value={username}
          onChangeText={setUsername}
        />
        <TextField
          testID="cu-password"
          label="Initial password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          helper="At least 8 characters"
          {...(pwErr ? { error: pwErr } : {})}
        />
        <FormField
          label="Administrator"
          trailing={
            <Radio testID="cu-role-admin" checked={role === 'admin'} onChange={() => setRole('admin')} />
          }
        />
        <FormField
          label="Standard user"
          trailing={
            <Radio testID="cu-role-user" checked={role === 'user'} onChange={() => setRole('user')} />
          }
        />
        <FormField
          label="Force password change on first login"
          trailing={<Toggle testID="cu-must" on={must} onChange={setMust} />}
        />
        <Button
          testID="cu-submit"
          label={create.isPending ? 'Creating…' : 'Create user'}
          onPress={gate(submit)}
          disabled={create.isPending || disabledProps.disabled}
        />
        <Button testID="cu-cancel" label="Cancel" variant="ghost" onPress={() => nav.goBack()} />
      </ScrollView>
    </ScreenContainer>
  );
}
