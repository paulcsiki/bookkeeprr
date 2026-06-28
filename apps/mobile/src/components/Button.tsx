import { Pressable, Text, type PressableProps, type ViewStyle } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';

interface Props extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  testID?: string;
  style?: ViewStyle;
}

export function Button({ label, variant = 'primary', disabled, style, ...rest }: Props) {
  const t = useTokens();
  const bg =
    variant === 'primary' ? t.primary : variant === 'secondary' ? t.surfaceMuted : 'transparent';
  const fg = variant === 'primary' ? t.primaryFg : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          paddingVertical: 14,
          paddingHorizontal: 18,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
      {...rest}
    >
      <Text style={[text.button, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}
