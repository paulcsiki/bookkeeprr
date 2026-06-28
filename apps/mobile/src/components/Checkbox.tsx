import { View, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  testID?: string;
}

export function Checkbox({ checked, onChange, testID }: Props) {
  const t = useTokens();
  return (
    <Pressable
      testID={testID}
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={6}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: checked ? t.primary : t.surface,
          borderWidth: 1.5,
          borderColor: checked ? t.primary : t.border,
        }}
      >
        {checked ? <Check size={12} color={t.primaryFg} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}
