import { View, Text } from 'react-native';
import type { ReactNode } from 'react';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { useLayout } from '@/responsive/useLayout';

interface Props {
  label: string;
  description?: string;
  children: ReactNode;
}

// Labeled settings group. On the wide tablet detail pane it lays out as a
// two-column form (label + description on the left, the controls card on the
// right, mirroring the desktop); on phone it stacks the label above the card.
export function SettingsSection({ label, description, children }: Props) {
  const t = useTokens();
  const layout = useLayout();

  const card = (
    <View
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );

  if (layout.isLandscape) {
    return (
      <View style={{ flexDirection: 'row', gap: 28, marginBottom: 28, paddingHorizontal: 8 }}>
        <View style={{ width: 200 }}>
          <Text
            style={{
              fontFamily: fonts.display.semibold,
              fontSize: 15,
              letterSpacing: -0.2,
              color: t.text,
            }}
          >
            {label}
          </Text>
          {description ? (
            <Text style={[text.bodySm, { color: t.textMuted, marginTop: 6, lineHeight: 18 }]}>
              {description}
            </Text>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>{card}</View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={[text.monoSm, { color: t.textMuted, paddingHorizontal: 18, paddingBottom: 8 }]}>
        {label}
      </Text>
      <View style={{ marginHorizontal: 14 }}>{card}</View>
    </View>
  );
}
