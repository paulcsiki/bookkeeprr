import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { StepDots } from '@/components/StepDots';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { fonts } from '@/theme/typography';
import { handshake } from '@/api/anon-client';
import { useOnboarding } from '@/state/onboardingStore';
import { loadRecentUrls, addRecentUrl } from '@/lib/recent-urls';
import type { OnboardingStackParamList } from '@/navigation/types';

const FormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Please enter your server URL.')
    .url('Enter a full URL like https://bookkeeprr.example.com'),
});
type FormValues = z.infer<typeof FormSchema>;

const MAX_VISIBLE_RECENTS = 3;

export default function ServerUrl() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const t = useTokens();
  const { setServerUrl } = useOnboarding();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sslWarning, setSslWarning] = useState(false);
  const [recentUrls, setRecentUrls] = useState<string[]>([]);

  const { control, handleSubmit, formState, watch, setValue } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { url: '' },
    mode: 'onChange',
  });

  const currentUrl = watch('url');

  // Load recent URLs on mount
  useEffect(() => {
    loadRecentUrls().then(setRecentUrls).catch(() => {
      /* best-effort */
    });
  }, []);

  const onSubmit = async ({ url }: FormValues) => {
    setBusy(true);
    setError(null);
    setSslWarning(false);
    try {
      const info = await handshake(url);
      // Persist successful connection URL before navigating
      await addRecentUrl(url).catch(() => { /* best-effort */ });
      setServerUrl(url);
      const mode = info.supported_auth_modes.includes('oidc') ? 'oidc' : 'forms';
      navigation.navigate('AuthHandoff', { mode });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'connection failed';
      if (/self.signed|certificate/i.test(msg)) setSslWarning(true);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // Show recent list only when the input is empty and there's no active error/warning
  const showRecentList =
    currentUrl.trim() === '' &&
    !sslWarning &&
    !error &&
    recentUrls.length > 0;

  const visibleRecents = recentUrls.slice(0, MAX_VISIBLE_RECENTS);

  return (
    <ScreenContainer testID="screen-server-url" edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ paddingTop: 16, paddingBottom: 8 }}>
        <StepDots current={2} total={3} testID="step-dots" />
        <Text style={[text.displayMd, { color: t.text, marginTop: 12 }]}>Server URL</Text>
        <Text style={[text.bodySm, { color: t.textMuted, marginTop: 4 }]}>
          Where is your bookkeeprr installation?
        </Text>
      </View>
      <View style={{ gap: 12, paddingVertical: 16 }}>
        <Controller
          control={control}
          name="url"
          render={({ field: { onChange, value, onBlur } }) => (
            <TextInput
              testID="input-server-url"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={handleSubmit(onSubmit)}
              placeholder="https://bookkeeprr.example.com"
              placeholderTextColor={t.textMuted}
              style={{
                color: t.text,
                backgroundColor: t.surface,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 14,
                borderWidth: 1,
                borderColor:
                  (error && !sslWarning) ||
                  (formState.errors.url && (formState.isDirty || formState.isSubmitted))
                    ? t.errFg
                    : sslWarning
                      ? t.warnFg
                      : t.border,
                fontFamily: 'Geist_400Regular',
                fontSize: 15,
              }}
            />
          )}
        />
        {formState.errors.url && (formState.isDirty || formState.isSubmitted) ? (
          <InlineAlert
            testID="err-msg"
            tone="err"
            body={formState.errors.url.message ?? 'Invalid URL'}
          />
        ) : null}
        {sslWarning ? (
          <View testID="ssl-warning" style={{ gap: 8 }}>
            <InlineAlert
              tone="warn"
              title="Self-signed certificate detected"
              body="This server's certificate isn't trusted by your device. You can review and trust it manually."
            />
            <Button
              testID="btn-trust-cert"
              label="Trust certificate"
              variant="secondary"
              onPress={() => navigation.navigate('TrustCert')}
            />
          </View>
        ) : null}
        {error && !sslWarning ? (
          <InlineAlert testID="err-msg" tone="err" title="Connection failed" body={error} />
        ) : null}
        {showRecentList ? (
          <View
            testID="recent-urls-list"
            style={{
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <Text
              style={{
                fontFamily: fonts.mono.regular,
                fontSize: 9.5,
                letterSpacing: 1.3,
                color: t.textMuted,
                paddingHorizontal: 14,
                paddingTop: 10,
                paddingBottom: 6,
              }}
            >
              RECENT
            </Text>
            {visibleRecents.map((url, idx) => (
              <Pressable
                key={url}
                testID={`recent-url-${idx}`}
                onPress={() => {
                  setValue('url', url, { shouldValidate: true, shouldDirty: true });
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: t.border,
                  backgroundColor: pressed ? t.surfaceMuted : 'transparent',
                })}
              >
                <Text
                  style={{
                    fontFamily: fonts.mono.regular,
                    fontSize: 13,
                    color: t.text,
                  }}
                  numberOfLines={1}
                >
                  {url}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ paddingBottom: 24, gap: 10 }}>
        <Button
          testID="btn-connect"
          label={busy ? 'Connecting…' : 'Connect'}
          onPress={handleSubmit(onSubmit)}
          // Stays tappable when empty/invalid so the attempt surfaces the
          // friendly validation message instead of doing nothing.
          disabled={busy}
        />
      </View>
    </ScreenContainer>
  );
}
