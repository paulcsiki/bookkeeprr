import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import type { AuditVerb } from '@/api/schemas';

interface Props {
  verb: AuditVerb;
}

export function VerbBadge({ verb }: Props) {
  const t = useTokens();
  const color =
    verb === 'create' ? t.ok : verb === 'update' ? t.info : verb === 'delete' ? t.err : t.primary;
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: t.surfaceMuted,
      }}
    >
      <Text style={[text.monoSm, { color }]}>{verb.toUpperCase()}</Text>
    </View>
  );
}
