import { View, Text } from 'react-native';
import { CloudOff } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';

/**
 * Standing offline placeholder for a `server`-class settings screen whose query
 * is paused offline (SP1's onlineManager) and has never resolved. Rendered in
 * place of the screen's `Loading…` spinner (the paused query would otherwise
 * spin forever). Disappears automatically on reconnect — no retry action.
 */
export function SettingsOfflineState() {
  const t = useTokens();
  return (
    <View
      testID="settings-offline-state"
      style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 56, paddingHorizontal: 28, gap: 12 }}
    >
      <CloudOff size={28} color={t.textMuted} strokeWidth={1.8} />
      <Text style={[text.displaySm, { color: t.text, textAlign: 'center' }]}>Offline</Text>
      <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center', lineHeight: 19, maxWidth: 320 }]}>
        These settings need a connection to the server. They&apos;ll load when you&apos;re back online.
      </Text>
    </View>
  );
}
