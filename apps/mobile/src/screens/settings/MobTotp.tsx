/**
 * MobTotp — Two-factor authentication management screen for mobile.
 *
 * Supports:
 *  - Setup: calls /api/auth/me/totp/setup, shows otpauth URI + secret (no QR — react-native-qrcode-svg
 *    is not installed). User scans URI or types the secret manually, then enters a code to enable.
 *  - Enabled state: shows "2FA is on" + disable / regenerate recovery codes actions.
 *
 * react-native-qrcode-svg is not installed — falls back to URI copy-to-clipboard.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, ShieldCheck, ShieldOff, RefreshCw, Copy, Check } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { useTokens } from '@/theme/ThemeProvider';
import { withAlpha } from '@/theme/color';
import { fonts, text } from '@/theme/typography';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

type Me = {
  id: number;
  username: string;
  authSource: string;
  totpEnabledAt: number | null;
};

type SetupData = {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
};

type Step = 'idle' | 'scan' | 'verify' | 'codes' | 'disable' | 'regen' | 'regen-result';

export default function MobTotp() {
  const t = useTokens();
  const navigation = useNavigation();
  const { state, signOut } = useAuth();

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const online = useIsOnline();
  const { gate } = useOnlineGate();

  const [step, setStep] = useState<Step>('idle');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [password, setPassword] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function getClient() {
    if (state.status !== 'authenticated') throw new Error('Not authenticated');
    return createApiClient(state.creds, { onAuthFail: () => signOut() });
  }

  const loadMe = useCallback(async () => {
    if (state.status !== 'authenticated') return;
    setLoading(true);
    try {
      const client = getClient();
      const data = await client.get<{ user: Me }>('/api/auth/me');
      setMe(data.user);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [state.status]);

  useFocusEffect(
    useCallback(() => {
      void loadMe();
    }, [loadMe]),
  );

  function copyToClipboard(text: string) {
    Clipboard.setString(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleStartSetup() {
    setPending(true);
    setError(null);
    try {
      const client = getClient();
      const data = await client.post<SetupData>('/api/auth/me/totp/setup', {});
      setSetupData(data);
      setStep('scan');
    } catch (e) {
      setError(e instanceof ApiError ? (e.body as {message?:string})?.message ?? 'Setup failed' : 'Setup failed');
    } finally {
      setPending(false);
    }
  }

  async function handleEnable() {
    if (!setupData) return;
    if (totpCode.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const client = getClient();
      await client.post('/api/auth/me/totp/enable', {
        secret: setupData.secret,
        code: totpCode,
        recoveryCodes: setupData.recoveryCodes,
      });
      setStep('codes');
    } catch (e) {
      setError(e instanceof ApiError ? (e.body as {message?:string})?.message ?? 'Invalid code.' : 'Invalid code.');
    } finally {
      setPending(false);
    }
  }

  async function handleDisable() {
    if (!password) return;
    setPending(true);
    setError(null);
    try {
      if (state.status !== 'authenticated') throw new Error('Not authenticated');
      const url = `${state.creds.serverUrl.replace(/\/$/, '')}/api/auth/me/totp`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.creds.token}`,
        },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setError(body.message ?? 'Incorrect password.');
        return;
      }
      setPassword('');
      setStep('idle');
      await loadMe();
    } catch {
      setError('Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  async function handleRegen() {
    if (!password) return;
    setPending(true);
    setError(null);
    try {
      const client = getClient();
      const data = await client.post<{ recoveryCodes: string[] }>('/api/auth/me/totp/recovery-codes/regenerate', { password });
      setNewCodes(data.recoveryCodes);
      setPassword('');
      setStep('regen-result');
    } catch (e) {
      setError(e instanceof ApiError ? (e.body as {message?:string})?.message ?? 'Incorrect password.' : 'Incorrect password.');
    } finally {
      setPending(false);
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 8,
    padding: 12,
    color: t.text,
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    backgroundColor: t.bg,
  };

  return (
    <ScreenContainer testID="screen-mob-totp">
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 12, gap: 10 }}>
        <Pressable testID="btn-back-totp" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Two-Factor Auth</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 16 }}>
        {!online && me === null ? (
          <SettingsOfflineState />
        ) : loading ? (
          <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        ) : me === null ? (
          <Text style={[text.bodySm, { color: t.err, padding: 24, textAlign: 'center' }]}>
            Could not load account info.
          </Text>
        ) : me.authSource !== 'local' ? (
          <View style={{ borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 16 }}>
            <Text style={[text.bodySm, { color: t.textMuted }]}>
              Two-factor authentication is not available for accounts authenticated via an external provider.
            </Text>
          </View>
        ) : step === 'idle' && me.totpEnabledAt == null ? (
          /* Not enabled */
          <View style={{ gap: 12 }}>
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ShieldOff size={20} color={t.textMuted} strokeWidth={1.75} />
              <Text style={[text.bodySm, { color: t.textMuted, flex: 1 }]}>
                Two-factor authentication is not enabled.
              </Text>
            </View>
            <Pressable
              testID="btn-setup-totp"
              onPress={gate(() => void handleStartSetup())}
              disabled={pending}
              style={{ borderRadius: 10, backgroundColor: t.primary, padding: 14, alignItems: 'center' }}
            >
              {pending ? (
                <ActivityIndicator color={t.primaryFg} />
              ) : (
                <Text style={{ fontFamily: fonts.sans.medium, fontSize: 15, color: t.primaryFg }}>
                  Set up two-factor authentication
                </Text>
              )}
            </Pressable>
            {error && <Text style={[text.bodySm, { color: t.err }]}>{error}</Text>}
          </View>
        ) : step === 'idle' && me.totpEnabledAt != null ? (
          /* Enabled */
          <View style={{ gap: 12 }}>
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: withAlpha(t.ok, 0.25), backgroundColor: withAlpha(t.ok, 0.08), padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ShieldCheck size={20} color={t.ok} strokeWidth={1.75} />
              <Text style={[text.bodySm, { color: t.text, flex: 1 }]}>
                Two-factor authentication is enabled.
              </Text>
            </View>
            <Pressable
              testID="btn-regen-totp"
              onPress={() => { setStep('regen'); setPassword(''); setError(null); }}
              style={{ borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <RefreshCw size={16} color={t.text} strokeWidth={1.75} />
              <Text style={{ fontFamily: fonts.sans.medium, fontSize: 15, color: t.text }}>Regenerate recovery codes</Text>
            </Pressable>
            <Pressable
              testID="btn-disable-totp"
              onPress={() => { setStep('disable'); setPassword(''); setError(null); }}
              style={{ borderRadius: 10, borderWidth: 1, borderColor: withAlpha(t.err, 0.25), backgroundColor: withAlpha(t.err, 0.08), padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <ShieldOff size={16} color={t.err} strokeWidth={1.75} />
              <Text style={{ fontFamily: fonts.sans.medium, fontSize: 15, color: t.err }}>Disable 2FA</Text>
            </Pressable>
          </View>
        ) : step === 'scan' && setupData ? (
          /* Step 1: Scan URI */
          <View style={{ gap: 16 }}>
            <Text style={[text.bodySm, { color: t.textMuted }]}>
              Open your authenticator app and enter the setup key, or scan the URI below.
            </Text>
            <View style={{ gap: 8 }}>
              <Text style={[text.label, { color: t.textMuted }]}>Secret key</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 12, gap: 8 }}>
                <Text style={{ fontFamily: fonts.mono.regular, fontSize: 13, color: t.text, flex: 1 }} selectable>
                  {setupData.secret}
                </Text>
                <Pressable onPress={() => copyToClipboard(setupData.secret)} hitSlop={8}>
                  {copied ? <Check size={16} color={t.primary} /> : <Copy size={16} color={t.textMuted} />}
                </Pressable>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={[text.label, { color: t.textMuted }]}>Auth URI (tap to copy)</Text>
              <Pressable
                onPress={() => copyToClipboard(setupData.otpauthUri)}
                style={{ borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 12 }}
              >
                <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, color: t.textMuted }} numberOfLines={3}>
                  {setupData.otpauthUri}
                </Text>
              </Pressable>
            </View>
            <Pressable
              testID="btn-totp-continue"
              onPress={() => { setStep('verify'); setTotpCode(''); setError(null); }}
              style={{ borderRadius: 10, backgroundColor: t.primary, padding: 14, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: fonts.sans.medium, fontSize: 15, color: t.primaryFg }}>Continue</Text>
            </Pressable>
          </View>
        ) : step === 'verify' ? (
          /* Step 2: Enter code */
          <View style={{ gap: 16 }}>
            <Text style={[text.bodySm, { color: t.textMuted }]}>
              Enter the 6-digit code from your authenticator app to confirm setup.
            </Text>
            <TextInput
              testID="input-totp-code"
              style={inputStyle}
              value={totpCode}
              onChangeText={(v) => setTotpCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={t.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            {error && <Text style={[text.bodySm, { color: t.err }]}>{error}</Text>}
            <Pressable
              testID="btn-totp-verify"
              onPress={gate(() => void handleEnable())}
              disabled={pending || totpCode.length !== 6}
              style={{ borderRadius: 10, backgroundColor: t.primary, padding: 14, alignItems: 'center', opacity: pending || totpCode.length !== 6 ? 0.5 : 1 }}
            >
              {pending ? <ActivityIndicator color={t.primaryFg} /> : <Text style={{ fontFamily: fonts.sans.medium, fontSize: 15, color: t.primaryFg }}>Verify</Text>}
            </Pressable>
            <Pressable onPress={() => { setStep('scan'); setError(null); }}>
              <Text style={[text.bodySm, { color: t.primary, textAlign: 'center' }]}>← Back</Text>
            </Pressable>
          </View>
        ) : step === 'codes' && setupData ? (
          /* Step 3: Recovery codes */
          <View style={{ gap: 16 }}>
            <Text style={[text.bodySm, { color: t.warn }]}>
              Save these recovery codes — they can only be shown once.
            </Text>
            <View style={{ borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 16, gap: 6 }}>
              {setupData.recoveryCodes.map((c) => (
                <Text key={c} style={{ fontFamily: fonts.mono.regular, fontSize: 13, color: t.text }}>{c}</Text>
              ))}
            </View>
            <Pressable
              onPress={() => copyToClipboard(setupData.recoveryCodes.join('\n'))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', padding: 10 }}
            >
              {copied ? <Check size={16} color={t.primary} /> : <Copy size={16} color={t.textMuted} />}
              <Text style={[text.bodySm, { color: t.textMuted }]}>{copied ? 'Copied!' : 'Copy all codes'}</Text>
            </Pressable>
            <Pressable
              testID="btn-totp-done"
              onPress={() => { setStep('idle'); void loadMe(); }}
              style={{ borderRadius: 10, backgroundColor: t.primary, padding: 14, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: fonts.sans.medium, fontSize: 15, color: t.primaryFg }}>Done — 2FA is on</Text>
            </Pressable>
          </View>
        ) : step === 'disable' ? (
          /* Disable 2FA */
          <View style={{ gap: 16 }}>
            <Text style={[text.bodySm, { color: t.textMuted }]}>
              Confirm your password to disable two-factor authentication.
            </Text>
            <TextInput
              testID="input-disable-password"
              style={inputStyle}
              value={password}
              onChangeText={setPassword}
              placeholder="Current password"
              placeholderTextColor={t.textMuted}
              secureTextEntry
              autoFocus
            />
            {error && <Text style={[text.bodySm, { color: t.err }]}>{error}</Text>}
            <Pressable
              testID="btn-disable-totp-confirm"
              onPress={gate(() => void handleDisable())}
              disabled={pending || !password}
              style={{ borderRadius: 10, backgroundColor: t.err, padding: 14, alignItems: 'center', opacity: pending || !password ? 0.5 : 1 }}
            >
              {pending ? <ActivityIndicator color={t.primaryFg} /> : <Text style={{ fontFamily: fonts.sans.medium, fontSize: 15, color: t.primaryFg }}>Disable 2FA</Text>}
            </Pressable>
            <Pressable onPress={() => { setStep('idle'); setPassword(''); setError(null); }}>
              <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center' }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : step === 'regen' ? (
          /* Regenerate recovery codes */
          <View style={{ gap: 16 }}>
            <Text style={[text.bodySm, { color: t.textMuted }]}>
              Confirm your password to generate 10 new recovery codes. Existing codes will be invalidated.
            </Text>
            <TextInput
              testID="input-regen-password"
              style={inputStyle}
              value={password}
              onChangeText={setPassword}
              placeholder="Current password"
              placeholderTextColor={t.textMuted}
              secureTextEntry
              autoFocus
            />
            {error && <Text style={[text.bodySm, { color: t.err }]}>{error}</Text>}
            <Pressable
              testID="btn-regen-confirm"
              onPress={gate(() => void handleRegen())}
              disabled={pending || !password}
              style={{ borderRadius: 10, backgroundColor: t.primary, padding: 14, alignItems: 'center', opacity: pending || !password ? 0.5 : 1 }}
            >
              {pending ? <ActivityIndicator color={t.primaryFg} /> : <Text style={{ fontFamily: fonts.sans.medium, fontSize: 15, color: t.primaryFg }}>Regenerate</Text>}
            </Pressable>
            <Pressable onPress={() => { setStep('idle'); setPassword(''); setError(null); }}>
              <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center' }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : step === 'regen-result' && newCodes ? (
          /* Show new recovery codes */
          <View style={{ gap: 16 }}>
            <Text style={[text.bodySm, { color: t.warn }]}>
              New recovery codes generated. Save them — old codes are invalid.
            </Text>
            <View style={{ borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 16, gap: 6 }}>
              {newCodes.map((c) => (
                <Text key={c} style={{ fontFamily: fonts.mono.regular, fontSize: 13, color: t.text }}>{c}</Text>
              ))}
            </View>
            <Pressable
              testID="btn-regen-done"
              onPress={() => { setStep('idle'); setNewCodes(null); }}
              style={{ borderRadius: 10, backgroundColor: t.primary, padding: 14, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: fonts.sans.medium, fontSize: 15, color: t.primaryFg }}>Done</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
