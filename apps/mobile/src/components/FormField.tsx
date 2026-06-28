// apps/mobile/src/components/FormField.tsx
import { View, Text, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';

interface Props {
  label: string;
  helper?: string;
  error?: string;
  trailing?: ReactNode; // Toggle / Radio etc.
  children?: ReactNode; // alternatively a full-width control under the label
  style?: ViewStyle;
}

export function FormField({ label, helper, error, trailing, children, style }: Props) {
  const t = useTokens();
  return (
    <View style={[{ gap: 6, paddingVertical: 4 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[text.label, { color: t.text }]}>{label}</Text>
          {helper && !error ? (
            <Text style={[text.monoSm, { color: t.textMuted, marginTop: 2 }]}>{helper}</Text>
          ) : null}
          {error ? <Text style={[text.monoSm, { color: t.errFg, marginTop: 2 }]}>{error}</Text> : null}
        </View>
        {trailing ?? null}
      </View>
      {children}
    </View>
  );
}
