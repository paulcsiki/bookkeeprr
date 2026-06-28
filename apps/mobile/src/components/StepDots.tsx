import { View } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { withAlpha } from '@/theme/color';

type Props = { current: number; total: number; testID?: string };

/**
 * Small horizontal indicator: filled dot for current step, faint dots
 * for others. Used at the top of onboarding screens to show progress.
 */
export function StepDots({ current, total, testID }: Props) {
  const t = useTokens();
  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const active = i + 1 === current;
        return (
          <View
            key={i}
            style={{
              width: active ? 18 : 6,
              height: 6,
              borderRadius: 99,
              backgroundColor: active ? t.primary : withAlpha(t.textMuted, 0.3),
            }}
          />
        );
      })}
    </View>
  );
}
