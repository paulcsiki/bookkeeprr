import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { loadChangelog } from '@/lib/changelog';
import { VersionBlock } from '@/features/updates/VersionBlock';

export default function VersionHistory() {
  const t = useTokens();
  const navigation = useNavigation();
  const { versions } = loadChangelog();
  const [current, ...older] = versions;
  const [expandedOlder, setExpandedOlder] = useState<Set<string>>(new Set());

  if (!current) {
    return (
      <ScreenContainer testID="screen-version-history">
        <Text style={[text.body, { color: t.textMuted, padding: 24 }]}>No releases yet.</Text>
      </ScreenContainer>
    );
  }

  const toggle = (v: string) => {
    setExpandedOlder((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  return (
    <ScreenContainer testID="screen-version-history">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable
          testID="btn-back-version-history"
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Version History</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <VersionBlock entry={current} expanded isCurrent />

        {older.length > 0 ? (
          <View>
            <Text
              style={[
                text.monoSm,
                { color: t.textMuted, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8 },
              ]}
            >
              EARLIER · {older.length} RELEASES
            </Text>
            {older.map((v) => {
              const expanded = expandedOlder.has(v.version);
              return (
                <View
                  key={v.version}
                  style={{
                    marginHorizontal: 14,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: t.border,
                    borderRadius: 12,
                    backgroundColor: t.surface,
                    overflow: 'hidden',
                  }}
                >
                  <Pressable testID={`older-${v.version}`} onPress={() => toggle(v.version)}>
                    <VersionBlock entry={v} expanded={expanded} />
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        padding: 12,
                        borderTopWidth: expanded ? 1 : 0,
                        borderTopColor: t.border,
                      }}
                    >
                      <Text style={[text.monoSm, { color: t.primary }]}>
                        {expanded ? 'COLLAPSE' : 'SHOW DETAILS'}
                      </Text>
                      {expanded ? (
                        <ChevronDown size={11} color={t.primary} strokeWidth={2} />
                      ) : (
                        <ChevronRight size={11} color={t.primary} strokeWidth={2} />
                      )}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
