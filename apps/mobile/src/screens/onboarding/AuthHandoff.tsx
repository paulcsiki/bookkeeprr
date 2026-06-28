import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Linking } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useOnboarding } from '@/state/onboardingStore';
import { buildLoginUrl, exchangeCode } from '@/auth/browser-handoff';
import { parseCallback } from '@/auth/deep-link';
import { useAuth } from '@/auth/AuthContext';
import type { OnboardingStackParamList } from '@/navigation/types';

export default function AuthHandoff() {
  const route = useRoute<RouteProp<OnboardingStackParamList, 'AuthHandoff'>>();
  const mode = route.params?.mode === 'oidc' ? 'oidc' : 'forms';
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const t = useTokens();
  const { serverUrl, certFingerprint } = useOnboarding();
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // The callback can arrive via two channels depending on the platform:
  //   - the openAuth promise resolving with the URL (iOS ASWebAuthenticationSession),
  //   - a bookkeeprr:// deep link (Android Custom Tabs dismisses the tab and
  //     routes the redirect as an intent — openAuth then resolves "dismiss").
  // Whichever lands first wins; this guard makes the other a no-op so the
  // single-use exchange code is consumed exactly once.
  const handledRef = useRef(false);

  // Returns true if `rawUrl` was a valid auth callback we took ownership of
  // (regardless of whether the subsequent exchange succeeded). Returns false
  // for URLs that aren't our callback, so the caller can decide whether that's
  // expected (an unrelated deep link) or an error (the browser handed us a URL
  // we couldn't read).
  const complete = useCallback(
    async (rawUrl: string): Promise<boolean> => {
      if (handledRef.current) return true;
      const parsed = parseCallback(rawUrl);
      if (!parsed.ok) return false; // not our callback — let the caller judge
      handledRef.current = true;
      setError(null);
      try {
        const creds = await exchangeCode(
          serverUrl || 'https://srv',
          parsed.exchangeCode,
          certFingerprint,
        );
        await signIn(creds);
        navigation.replace('Connected');
      } catch (e: unknown) {
        handledRef.current = false; // allow a retry with a fresh code
        setError(e instanceof Error ? e.message : 'Sign-in failed.');
      }
      return true;
    },
    [serverUrl, certFingerprint, signIn, navigation],
  );

  const start = useCallback(async () => {
    handledRef.current = false;
    setError(null);
    try {
      if (process.env.EXPO_PUBLIC_MOBILE_E2E_AUTOAUTH === '1') {
        await complete('bookkeeprr://auth/callback?exchange=e2e-bypass-code');
        return;
      }
      const available = await InAppBrowser.isAvailable();
      if (!available) {
        setError('In-app browser unavailable on this device');
        return;
      }
      const result = await InAppBrowser.openAuth(
        buildLoginUrl(serverUrl),
        'bookkeeprr://auth/callback',
        {
          showTitle: false,
          enableUrlBarHiding: true,
          enableDefaultShare: false,
          ephemeralWebSession: true,
        },
      );
      if (result.type === 'success' && result.url) {
        // The session handed back a URL — it MUST be our callback. If it
        // doesn't parse, surface it rather than spinning forever.
        const handled = await complete(result.url);
        if (!handled && !handledRef.current) {
          setError(`Sign-in response not recognized: ${result.url}`);
        }
        return;
      }
      // The tab closed without the session handing back a URL. On Android the
      // OS usually delivers the redirect as a bookkeeprr:// deep link instead,
      // which the Linking listener below completes — so only surface a
      // cancellation if nothing has handled it.
      if (!handledRef.current) setError('Sign-in was cancelled.');
    } catch (e: unknown) {
      if (!handledRef.current) setError(e instanceof Error ? e.message : 'auth failed');
    }
  }, [serverUrl, complete]);

  // Deep-link channel — must be listening before the browser returns.
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      void complete(url);
    });
    Linking.getInitialURL()
      .then((url) => {
        if (url) void complete(url);
      })
      .catch(() => undefined);
    return () => sub.remove();
  }, [complete]);

  // Auto-launch once on mount — there is no manual "open browser" step.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    void start();
  }, [start]);

  return (
    <ScreenContainer testID={`screen-auth-handoff-${mode}`} edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ paddingTop: 16 }}>
        <Text style={[text.displayMd, { color: t.text }]}>
          {mode === 'oidc' ? 'Signing in with your provider' : 'Signing you in'}
        </Text>
        <Text style={[text.bodySm, { color: t.textMuted, marginTop: 6 }]}>
          A secure browser is opening your server&apos;s sign-in. You&apos;ll return here
          automatically.
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {error === null ? (
          <ActivityIndicator color={t.primary} />
        ) : (
          <Text testID="auth-handoff-error" style={[text.bodySm, { color: t.err }]}>
            {error}
          </Text>
        )}
      </View>
      {error !== null ? (
        <View style={{ paddingBottom: 24, gap: 10 }}>
          <Button testID="btn-retry-auth" label="Try again" onPress={start} />
          <Button
            testID="btn-back"
            label="Back"
            variant="ghost"
            onPress={() => navigation.goBack()}
          />
        </View>
      ) : null}
    </ScreenContainer>
  );
}
