import { Modal, View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { X } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { useDashboardPrefs, useSetDashboardPrefs } from '@/api/hooks/useDashboardPrefs';
import type { WidgetId } from '@/api/schemas';

// The widgets the mobile Home renders (feed is web-only). Order here is just the
// customize-list order; the dashboard renders them in its own fixed order.
const MOBILE_WIDGETS: { id: WidgetId; label: string; desc: string }[] = [
  { id: 'continue', label: 'Continue reading', desc: 'Pick up where you left off' },
  { id: 'personal', label: 'Your reading stats', desc: 'Time, units, books & streak' },
  { id: 'goals', label: 'Reading goals', desc: 'Yearly & weekly progress rings' },
  { id: 'format', label: 'By format', desc: 'Breakdown by media type' },
  { id: 'leaderboard', label: 'Household leaderboard', desc: 'Friendly ranking of members' },
  { id: 'releases', label: 'Upcoming releases', desc: 'New volumes on the way' },
  { id: 'recent', label: 'Recently added', desc: 'Latest additions' },
  { id: 'server', label: 'Server totals', desc: 'Combined stats across members' },
];

/**
 * Toggle which dashboard widgets are enabled. Shares the same per-user prefs as
 * the web (PUT /api/dashboard/prefs validates the full order + enabled map, so we
 * always send the complete prefs with just the toggled flag changed).
 */
export function CustomizeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTokens();
  const prefs = useDashboardPrefs();
  const setPrefs = useSetDashboardPrefs();
  const enabled = prefs.data?.enabled ?? {};

  const toggle = (id: WidgetId, value: boolean): void => {
    if (!prefs.data) return;
    setPrefs.mutate({ ...prefs.data, enabled: { ...prefs.data.enabled, [id]: value } });
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: withAlpha(t.coverBase, 0.6) }}>
        <View
          style={{
            backgroundColor: t.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderWidth: 1,
            borderColor: t.border,
            maxHeight: '82%',
            paddingTop: 18,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14 }}>
            <Text style={{ flex: 1, fontFamily: fonts.display.semibold, fontSize: 19, color: t.text }}>
              Customize dashboard
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" testID="customize-close" hitSlop={10}>
              <X size={22} color={t.textMuted} strokeWidth={2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 4 }}>
            {MOBILE_WIDGETS.map((w) => {
              const on = enabled[w.id] !== false;
              return (
                <View
                  key={w.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.sans.medium, fontSize: 14.5, color: t.text }}>{w.label}</Text>
                    <Text style={{ fontFamily: fonts.sans.regular, fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>
                      {w.desc}
                    </Text>
                  </View>
                  <Switch
                    value={on}
                    onValueChange={(v) => toggle(w.id, v)}
                    disabled={!prefs.data || setPrefs.isPending}
                    trackColor={{ false: t.border, true: t.primary }}
                    testID={`customize-${w.id}`}
                  />
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
