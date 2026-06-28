import { View, Text, Pressable } from 'react-native';
import { ArrowUp, X } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';

interface Props {
  mobile: string;
  serverCurrent: string;
  onInstall: () => void;
  onOpenChangelog: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({
  mobile,
  serverCurrent,
  onInstall,
  onOpenChangelog,
  onDismiss,
}: Props) {
  const t = useTokens();
  return (
    <View
      testID="update-banner"
      style={{
        marginHorizontal: 14,
        marginBottom: 14,
        padding: 14,
        backgroundColor: t.surface,
        borderColor: t.primary,
        borderWidth: 1,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.primary,
        }}
      >
        <ArrowUp size={18} color={t.primaryFg} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[text.label, { color: t.text }]}>Update available</Text>
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: t.primary,
            }}
          >
            <Text style={[text.monoSm, { color: t.primaryFg }]}>v{serverCurrent}</Text>
          </View>
        </View>
        <Text style={[text.monoSm, { color: t.textMuted, marginTop: 2 }]}>
          v{mobile} → v{serverCurrent}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Pressable
          testID="btn-update-install"
          onPress={onInstall}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: t.primary,
          }}
        >
          <Text style={[text.label, { color: t.primaryFg }]}>Install</Text>
        </Pressable>
        <Pressable testID="btn-update-changelog" onPress={onOpenChangelog} hitSlop={4}>
          <Text style={[text.bodySm, { color: t.textMuted }]}>What&apos;s new</Text>
        </Pressable>
      </View>
      <Pressable
        testID="btn-update-dismiss"
        onPress={onDismiss}
        hitSlop={8}
        style={{ position: 'absolute', top: 6, right: 8 }}
      >
        <X size={14} color={t.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
