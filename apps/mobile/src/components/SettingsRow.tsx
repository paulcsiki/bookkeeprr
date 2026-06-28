import { View, Text, Pressable } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';

interface Props {
  icon: LucideIcon;
  name: string;
  sub?: string;
  value?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
  last?: boolean;
}

export function SettingsRow({
  icon: Icon,
  name,
  sub,
  value,
  trailing,
  onPress,
  testID,
  last,
}: Props) {
  const t = useTokens();
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.border,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          backgroundColor: t.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={15} color={t.text} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[text.label, { color: t.text }]}>{name}</Text>
        {sub ? (
          <Text numberOfLines={1} style={[text.monoSm, { color: t.textMuted, marginTop: 2 }]}>
            {sub}
          </Text>
        ) : null}
      </View>
      {value ? <Text style={[text.bodySm, { color: t.textMuted }]}>{value}</Text> : null}
      {trailing}
      {onPress && !trailing ? (
        <ChevronRight size={14} color={t.textMuted} strokeWidth={1.75} />
      ) : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable testID={testID} onPress={onPress}>
      {body}
    </Pressable>
  );
}
