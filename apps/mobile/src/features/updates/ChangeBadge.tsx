import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import type { ChangeKind } from '@/lib/changelog';

const LABEL: Record<ChangeKind, string> = {
  feat: 'NEW',
  fix: 'FIX',
  perf: 'PERF',
  break: 'BREAKING',
};

interface Props {
  kind: ChangeKind;
}

export function ChangeBadge({ kind }: Props) {
  const t = useTokens();
  const color =
    kind === 'feat' ? t.ebook : kind === 'fix' ? t.manga : kind === 'perf' ? t.primary : t.err;
  return (
    <View
      testID={`change-badge-${kind}`}
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <Text style={[text.monoSm, { color }]}>{LABEL[kind]}</Text>
    </View>
  );
}
