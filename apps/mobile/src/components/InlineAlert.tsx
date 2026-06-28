import { View, Text } from 'react-native';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text as textStyles } from '@/theme/typography';

export type AlertTone = 'err' | 'warn' | 'info';

const ICONS: Record<AlertTone, typeof AlertCircle> = {
  err: AlertCircle,
  warn: AlertTriangle,
  info: Info,
};

interface Props {
  tone?: AlertTone;
  title?: string;
  body: string;
  testID?: string;
}

export function InlineAlert({ tone = 'err', title, body, testID }: Props) {
  const t = useTokens();
  const Icon = ICONS[tone];
  const fg = tone === 'err' ? t.errFg : tone === 'warn' ? t.warnFg : t.infoFg;
  const bg = tone === 'err' ? t.errBg : tone === 'warn' ? t.warnBg : t.infoBg;
  const line = tone === 'err' ? t.errLine : tone === 'warn' ? t.warnLine : t.infoLine;
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        padding: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: line,
        backgroundColor: bg,
      }}
    >
      <Icon size={14} color={fg} strokeWidth={2} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0, gap: title ? 3 : 0 }}>
        {title ? (
          <Text style={[textStyles.label, { color: fg, fontWeight: '600' }]}>{title}</Text>
        ) : null}
        <Text style={[textStyles.bodySm, { color: t.textMuted, lineHeight: 18 }]}>{body}</Text>
      </View>
    </View>
  );
}
