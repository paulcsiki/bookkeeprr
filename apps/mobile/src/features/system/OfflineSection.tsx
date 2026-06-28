import { View, Text } from 'react-native';
import { CloudOff } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';

/**
 * A tidy "this section is back online" card used as the `<OnlineOnly fallback>`
 * for Home's server-only widget block and as the not-cached header on
 * SeriesOverview / SeriesVolumes. One card instead of N collapsed nulls.
 */
export function OfflineSection({ title, sub }: { title: string; sub?: string }) {
  const t = useTokens();
  return (
    <View
      testID="offline-section"
      style={{
        marginHorizontal: 18,
        marginTop: 22,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.surface,
        borderRadius: 16,
        paddingVertical: 28,
        paddingHorizontal: 20,
        alignItems: 'center',
        gap: 10,
      }}
    >
      <CloudOff size={22} color={t.textMuted} strokeWidth={1.8} />
      <Text style={[text.displaySm, { color: t.text, textAlign: 'center' }]}>{title}</Text>
      {sub ? (
        <Text
          style={{
            fontFamily: fonts.sans.regular,
            fontSize: 12.5,
            lineHeight: 18,
            color: t.textMuted,
            textAlign: 'center',
          }}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}
