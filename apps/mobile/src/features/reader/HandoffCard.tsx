import { View, Text } from 'react-native';
import { Smartphone } from 'lucide-react-native';
import { text } from '@/theme/typography';
import { useTokens } from '@/theme/ThemeProvider';
import { Button } from '@/components/Button';

export type HandoffCardProps = {
  deviceName: string;
  position: number;     // 0..1
  chapter?: string;
  lastSyncedAgo?: string;
  onResume: () => void;
};

/**
 * "Continue from your iPhone · ch.12 · 41%" card. Shown when a peer
 * device's position is meaningfully ahead of the local one.
 */
export function HandoffCard({
  deviceName,
  position,
  chapter,
  lastSyncedAgo = 'just now',
  onResume,
}: HandoffCardProps) {
  const t = useTokens();
  const pct = Math.round(position * 100);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.surface,
        padding: 14,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.surfaceMuted,
        }}
      >
        <Smartphone size={20} color={t.primary} strokeWidth={1.7} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[text.label, { color: t.text }]} numberOfLines={1}>
          Continue from {deviceName}
        </Text>
        <Text style={[text.monoSm, { color: t.textMuted, marginTop: 2 }]} numberOfLines={1}>
          {chapter ? `${chapter} · ` : ''}{pct}% · synced {lastSyncedAgo}
        </Text>
      </View>
      <Button
        label="Resume"
        variant="secondary"
        onPress={onResume}
        style={{ paddingVertical: 8, paddingHorizontal: 14 }}
      />
    </View>
  );
}
