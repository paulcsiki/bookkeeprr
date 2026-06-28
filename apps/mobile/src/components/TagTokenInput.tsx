// apps/mobile/src/components/TagTokenInput.tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';

interface Props {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  helper?: string;
  testID?: string;
}

export function TagTokenInput({ label, value, onChange, placeholder, helper, testID }: Props) {
  const t = useTokens();
  const [draft, setDraft] = useState('');

  function commit(raw: string) {
    const tok = raw.trim().replace(/,$/, '').trim();
    if (tok && !value.includes(tok)) onChange([...value, tok]);
    setDraft('');
  }
  function onChangeText(next: string) {
    if (next.endsWith(',')) commit(next);
    else setDraft(next);
  }
  function remove(tok: string) {
    onChange(value.filter((v) => v !== tok));
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={[text.label, { color: t.textMuted }]}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          backgroundColor: t.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.border,
          padding: 8,
          alignItems: 'center',
        }}
      >
        {value.map((tok) => (
          <Pressable
            key={tok}
            testID={testID ? `${testID}-chip-${tok}` : undefined}
            onPress={() => remove(tok)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: withAlpha(t.primary, 0.16),
            }}
          >
            <Text style={[text.monoSm, { color: t.primary }]}>{tok}</Text>
            <X size={12} color={t.primary} />
          </Pressable>
        ))}
        <TextInput
          testID={testID ? `${testID}-input` : undefined}
          value={draft}
          onChangeText={onChangeText}
          onSubmitEditing={(e) => commit(e.nativeEvent.text)}
          onKeyPress={(e) => {
            const last = value[value.length - 1];
            if (e.nativeEvent.key === 'Backspace' && draft === '' && last !== undefined) {
              remove(last);
            }
          }}
          blurOnSubmit={false}
          placeholder={value.length === 0 ? placeholder : undefined}
          placeholderTextColor={t.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flexGrow: 1,
            minWidth: 80,
            color: t.text,
            fontFamily: fonts.sans.regular,
            fontSize: 14,
            paddingVertical: 4,
          }}
        />
      </View>
      {helper ? <Text style={[text.monoSm, { color: t.textMuted }]}>{helper}</Text> : null}
    </View>
  );
}
