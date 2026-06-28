import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_THEMES, type AccentTheme, tokens as TOKEN_MAP } from '@/theme/tokens';
import { text } from '@/theme/typography';

const TRANSPARENT = 'transparent';

export function ThemeSwitcher() {
  const { accent, scheme, setAccent, setScheme } = useTheme();
  const t = TOKEN_MAP[accent][scheme];
  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={[text.label, { color: t.textMuted, marginBottom: 8 }]}>ACCENT</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {ACCENT_THEMES.map((name) => {
            // Sumi is a light-only accent; Galley (Shiro) is reserved for dark.
            const disabled =
              (name === 'sumi' && scheme === 'dark') || (name === 'galley' && scheme === 'light');
            const isActive = accent === name;
            return (
              <Pressable
                key={name}
                testID={`swatch-${name}`}
                disabled={disabled}
                onPress={() => setAccent(name as AccentTheme)}
                accessibilityState={{ selected: isActive, disabled }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: disabled ? t.swatchDisabledBg : TOKEN_MAP[name][scheme].primary,
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive ? t.text : t.border,
                  opacity: disabled ? 0.35 : 1,
                }}
              />
            );
          })}
        </View>
      </View>
      <View>
        <Text style={[text.label, { color: t.textMuted, marginBottom: 8 }]}>SCHEME</Text>
        <View
          style={{
            flexDirection: 'row',
            borderRadius: 10,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.border,
            padding: 2,
          }}
        >
          {(['light', 'dark'] as const).map((s) => {
            const active = scheme === s;
            const bg = active ? t.primary : TRANSPARENT;
            return (
              <Pressable
                key={s}
                testID={`scheme-${s}`}
                onPress={() => setScheme(s)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: bg,
                  alignItems: 'center',
                }}
              >
                <Text style={[text.label, { color: active ? t.primaryFg : t.text }]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
