import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, View, SafeAreaView } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { LogoMark } from '@/components/Logo';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { pushEventBus, type PushBannerMessage } from './pushEventBus';
import { pushNotification } from './notificationHistory';

// Banner auto-dismisses after 5s in production. In Maestro e2e (when
// EXPO_PUBLIC_MOBILE_E2E_PUSH_FIRE is baked into the bundle), extend to 60s so
// the assertVisible polling has room to find the banner across the multi-step
// foreground-banner / deep-link-tap flows without racing the dismiss timer.
const AUTO_DISMISS_MS = process.env.EXPO_PUBLIC_MOBILE_E2E_PUSH_FIRE === '1' ? 60_000 : 5_000;

// Floating banner pinned to the top of the screen that surfaces foreground
// push notifications while the app is in the foreground (rn-firebase suppresses
// the OS notification in that state). Subscribes to BOTH `messaging().onMessage`
// AND `pushEventBus.on` so the e2e bootstrap can drive it without rn-firebase
// being wired to a real FCM project.
export function InAppBanner() {
  const t = useTokens();
  const [msg, setMsg] = useState<PushBannerMessage | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function show(next: PushBannerMessage) {
      if (next.title === '' && next.body === '') return;
      setMsg(next);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setMsg(null), AUTO_DISMISS_MS);
      // Persist to rolling history (best-effort).
      const histEntry = {
        title: next.title,
        body: next.body,
        receivedAt: Date.now(),
        ...(next.deepLink !== null ? { deepLink: next.deepLink } : {}),
      };
      pushNotification(histEntry).catch(() => { /* best-effort */ });
    }

    const unsubRnFirebase = messaging().onMessage((payload) => {
      const title = payload.notification?.title ?? '';
      const body = payload.notification?.body ?? '';
      const deepLinkRaw = payload.data?.deep_link;
      const deepLink = typeof deepLinkRaw === 'string' ? deepLinkRaw : null;
      show({ title, body, deepLink });
    });

    const unsubBus = pushEventBus.on(show);

    return () => {
      unsubRnFirebase();
      unsubBus();
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (msg === null) return null;

  function onPress() {
    const link = msg?.deepLink;
    if (typeof link === 'string' && link.length > 0) {
      Linking.openURL(link).catch(() => undefined);
    }
    setMsg(null);
  }

  return (
    <SafeAreaView
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
      }}
    >
      <Pressable
        testID="in-app-banner"
        onPress={onPress}
        style={{
          marginHorizontal: 12,
          marginTop: 12,
          padding: 12,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 12,
          flexDirection: 'row',
          gap: 12,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(t.primary, 0.16),
          }}
        >
          <LogoMark size={20} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12.5, color: t.text }}>bookkeeprr</Text>
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', color: t.textMuted }}>· Now</Text>
          </View>
          <Text style={{ fontFamily: fonts.sans.medium, fontSize: 13, color: t.text }} numberOfLines={1}>{msg.title}</Text>
          <Text style={{ fontFamily: fonts.sans.regular, fontSize: 12, color: t.textMuted }} numberOfLines={2}>{msg.body}</Text>
        </View>
      </Pressable>
    </SafeAreaView>
  );
}
