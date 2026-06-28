import type { ComponentType } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text as textStyles } from '@/theme/typography';
import { withAlpha } from '@/theme/color';

export type EmptyStateVariant = 'primary' | 'muted' | 'ok' | 'err';

type Props = {
  variant?: EmptyStateVariant;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  hint?: string;
};

function tintFor(variant: EmptyStateVariant, t: ReturnType<typeof useTokens>): { bg: string; fg: string; line: string } {
  switch (variant) {
    case 'ok':
      return { bg: withAlpha(t.ok, 0.14), fg: t.ok, line: withAlpha(t.ok, 0.35) };
    case 'err':
      return { bg: withAlpha(t.err, 0.12), fg: t.err, line: withAlpha(t.err, 0.35) };
    case 'muted':
      return { bg: t.surfaceMuted, fg: t.textMuted, line: t.border };
    case 'primary':
    default:
      return { bg: withAlpha(t.primary, 0.16), fg: t.primary, line: withAlpha(t.primary, 0.35) };
  }
}

export function EmptyState({ variant = 'primary', icon: Icon, title, body, actionLabel, onAction, hint }: Props) {
  const t = useTokens();
  const tint = tintFor(variant, t);

  return (
    <View
      style={{
        padding: 32,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.surface,
        alignItems: 'center',
        gap: 6,
      }}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 12,
          marginBottom: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint.bg,
          borderWidth: 1,
          borderColor: tint.line,
        }}
      >
        <Icon size={26} color={tint.fg} strokeWidth={1.6} />
      </View>
      <Text
        style={{
          fontFamily: fonts.display.semibold,
          fontSize: 19,
          letterSpacing: -0.38,
          color: t.text,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {body ? (
        <Text style={[textStyles.bodySm, { color: t.textMuted, textAlign: 'center', maxWidth: 320, lineHeight: 20 }]}>
          {body}
        </Text>
      ) : null}
      {actionLabel ? (
        <Pressable
          onPress={onAction}
          style={{
            marginTop: 18,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: t.primary,
          }}
        >
          <Text style={{ color: t.primaryFg, fontFamily: fonts.sans.medium, fontSize: 13 }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
      {hint ? (
        <Text
          style={{
            marginTop: 14,
            fontFamily: fonts.mono.regular,
            fontSize: 10.5,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: t.textMuted,
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
