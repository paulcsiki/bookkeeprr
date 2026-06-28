import { View, Pressable } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';

interface Props {
  checked: boolean;
  onChange: () => void;
  testID?: string;
}

export function Radio({ checked, onChange, testID }: Props) {
  const t = useTokens();
  return (
    <Pressable
      testID={testID}
      onPress={onChange}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      hitSlop={6}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.surface,
          borderWidth: 1.5,
          borderColor: checked ? t.primary : t.border,
        }}
      >
        {checked ? (
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.primary }} />
        ) : null}
      </View>
    </Pressable>
  );
}
