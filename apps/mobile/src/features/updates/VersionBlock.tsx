import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import type { VersionEntry } from '@/lib/changelog';
import { ChangeBadge } from './ChangeBadge';

interface Props {
  entry: VersionEntry;
  expanded: boolean;
  isCurrent?: boolean;
}

export function VersionBlock({ entry, expanded, isCurrent = false }: Props) {
  const t = useTokens();
  return (
    <View testID={`version-block-${entry.version}`}>
      <View
        style={{
          padding: 16,
          borderBottomWidth: expanded ? 1 : 0,
          borderBottomColor: t.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={[text.displayLg, { color: t.text }]}>v{entry.version}</Text>
          {isCurrent ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: t.primary,
              }}
            >
              <Text style={[text.monoSm, { color: t.primaryFg }]}>Current</Text>
            </View>
          ) : null}
          <Text style={[text.monoSm, { color: t.textMuted, marginLeft: 'auto' }]}>
            {entry.date}
          </Text>
        </View>
        <Text style={[text.bodySm, { color: t.textMuted, marginTop: 6 }]}>{entry.summary}</Text>
      </View>
      {expanded
        ? entry.sections.map((sec, idx) => (
            <View
              key={`${sec.kind}-${idx}`}
              style={{
                padding: 16,
                borderBottomWidth: idx === entry.sections.length - 1 ? 0 : 1,
                borderBottomColor: t.border,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ChangeBadge kind={sec.kind} />
                <Text style={[text.monoSm, { color: t.textMuted }]}>
                  {sec.label.toUpperCase()} · {sec.items.length}
                </Text>
              </View>
              <View style={{ gap: 10 }}>
                {sec.items.map((item, ii) => (
                  <View key={ii} style={{ flexDirection: 'row', gap: 10 }}>
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: t.primary,
                        marginTop: 8,
                      }}
                    />
                    <Text style={[text.body, { flex: 1, color: t.text }]}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        : null}
    </View>
  );
}
