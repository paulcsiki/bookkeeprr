// apps/mobile/src/components/TextField.tsx
import { View, Text, TextInput, type KeyboardTypeOptions } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';

interface Props {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  error?: string;
  helper?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  testID?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  error,
  helper,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  autoCorrect = false,
  testID,
}: Props) {
  const t = useTokens();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[text.label, { color: t.textMuted }]}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        style={{
          color: t.text,
          backgroundColor: t.surface,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: error ? t.errFg : t.border,
          fontFamily: fonts.sans.regular,
          fontSize: 15,
        }}
      />
      {error ? (
        <Text testID={testID ? `${testID}-error` : undefined} style={[text.monoSm, { color: t.errFg }]}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={[text.monoSm, { color: t.textMuted }]}>{helper}</Text>
      ) : null}
    </View>
  );
}
