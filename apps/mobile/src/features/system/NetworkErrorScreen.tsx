import { View, Text } from 'react-native';
import { Globe } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';

type Props = {
  cachedCount?: number;
  onRetry: () => void;
  onViewCached?: () => void;
};

export function NetworkErrorScreen({ cachedCount = 0, onRetry, onViewCached }: Props) {
  const t = useTokens();
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.bg,
        gap: 14,
      }}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha(t.err, 0.14),
          borderWidth: 1,
          borderColor: withAlpha(t.err, 0.35),
        }}
      >
        <Globe size={26} color={t.err} strokeWidth={2} />
      </View>
      <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: t.textMuted }}>
        Can&apos;t reach server
      </Text>
      <Text style={[text.displayMd, { color: t.text }]}>We&apos;re offline</Text>
      <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center', maxWidth: 320, lineHeight: 19 }]}>
        {cachedCount > 0
          ? `${cachedCount} series available offline.`
          : 'No cached content available. Reconnect to load your library.'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Button testID="btn-net-retry" label="Retry" onPress={onRetry} />
        {onViewCached && cachedCount > 0 ? (
          <Button testID="btn-net-cached" label="View cached" variant="secondary" onPress={onViewCached} />
        ) : null}
      </View>
    </View>
  );
}
