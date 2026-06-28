import { View, Pressable } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';

interface Props {
  on: boolean;
  onChange: (next: boolean) => void;
  testID?: string;
}

export function Toggle({ on, onChange, testID }: Props) {
  const t = useTokens();
  return (
    <Pressable
      testID={testID}
      onPress={() => onChange(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      hitSlop={6}
    >
      <View
        style={{
          width: 40,
          height: 24,
          borderRadius: 999,
          backgroundColor: on ? t.primary : t.surfaceMuted,
          borderWidth: 1,
          borderColor: on ? t.primary : t.border,
          justifyContent: 'center',
          paddingHorizontal: 2,
        }}
      >
        <View
          style={{
            alignSelf: on ? 'flex-end' : 'flex-start',
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: t.primaryFg,
          }}
        />
      </View>
    </Pressable>
  );
}
