import { View, Text, ScrollView } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { Button } from '@/components/Button';
import { ChangeBadge } from './ChangeBadge';
import type { VersionEntry } from '@/lib/changelog';

// eslint-disable-next-line bookkeeprr-mobile/no-color-literals
const SCRIM_COLOR = 'rgba(0,0,0,0.75)';

interface Props {
  entry: VersionEntry;
  previousVersion: string | null;
  onDismiss: () => void;
}

export function ChangelogModal({ entry, previousVersion, onDismiss }: Props) {
  const t = useTokens();
  return (
    <View
      testID="changelog-modal"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: SCRIM_COLOR,
        justifyContent: 'flex-end',
      }}
    >
      <View
        style={{
          backgroundColor: t.bg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderTopWidth: 1,
          borderColor: t.border,
          maxHeight: '85%',
          paddingTop: 6,
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 36,
            height: 4,
            borderRadius: 999,
            backgroundColor: t.border,
            marginTop: 6,
            marginBottom: 8,
          }}
        />
        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
          }}
        >
          <Text style={[text.monoSm, { color: t.primary }]}>UPDATE INSTALLED</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
            <Text style={[text.displayLg, { color: t.text }]}>What&apos;s new</Text>
            <Text style={[text.mono, { color: t.primary }]}>v{entry.version}</Text>
          </View>
          {previousVersion ? (
            <Text style={[text.bodySm, { color: t.textMuted, marginTop: 8 }]}>
              You upgraded from{' '}
              <Text style={[text.mono, { color: t.text }]}>v{previousVersion}</Text>.{' '}
              {entry.summary}
            </Text>
          ) : (
            <Text style={[text.bodySm, { color: t.textMuted, marginTop: 8 }]}>{entry.summary}</Text>
          )}
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          {entry.sections.map((sec, idx) => (
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
          ))}
          <Text
            style={[text.monoSm, { color: t.textMuted, paddingHorizontal: 16, paddingTop: 12 }]}
          >
            You&apos;ll only see this once per release. Tap the version in Settings → About to read
            it again.
          </Text>
        </ScrollView>
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: t.border }}>
          <Button testID="btn-changelog-dismiss" label="Got it" onPress={onDismiss} />
        </View>
      </View>
    </View>
  );
}
