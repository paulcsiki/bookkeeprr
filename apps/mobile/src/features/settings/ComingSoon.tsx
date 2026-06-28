// apps/mobile/src/features/settings/ComingSoon.tsx
import { View, Text } from 'react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';

export function ComingSoon({ title }: { title: string }) {
  const t = useTokens();
  return (
    <ScreenContainer testID="coming-soon">
      <View style={{ paddingTop: 16, paddingBottom: 12 }}>
        <Text style={[text.displayMd, { color: t.text }]}>{title}</Text>
      </View>
      <Text style={[text.bodySm, { color: t.textMuted, paddingHorizontal: 4 }]}>
        This section is configured on the desktop today. Native editing is coming to mobile.
      </Text>
    </ScreenContainer>
  );
}
