import type { ComponentType } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  Activity as ActivityIcon,
  Home as HomeIcon,
  Library as LibraryIcon,
  Settings as SettingsIcon,
  Plus,
  type LucideProps,
} from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { useDownloads } from '@/api/hooks';

const TAB_ICON: Record<string, ComponentType<LucideProps>> = {
  Home: HomeIcon,
  Library: LibraryIcon,
  Activity: ActivityIcon,
  Settings: SettingsIcon,
};

// Custom bottom bar with five equal-width slots:
//   Home · Library · [+ FAB] · Activity · Settings
// The FAB occupies the centre slot (purely visual — not a route) and opens
// the Add modal in the Library stack from anywhere in the app.
export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const downloads = useDownloads();
  const activeDownloads = (downloads.data?.downloads ?? []).filter(
    (d) => d.status === 'queued' || d.status === 'downloading' || d.status === 'importing',
  ).length;

  function go(routeName: string) {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return;
    const isFocused = state.routes[state.index]?.key === route.key;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
  }

  const isActive = (routeName: string) => state.routes[state.index]?.name === routeName;

  function Tab({ name, label }: { name: string; label: string }) {
    const IconCmp = TAB_ICON[name]!;
    const active = isActive(name);
    const color = active ? t.primary : t.textMuted;
    return (
      <Pressable
        onPress={() => go(name)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
        testID={`tab-${name.toLowerCase()}`}
        style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 }}
      >
        <View>
          <IconCmp color={color} size={20} strokeWidth={1.7} />
          {name === 'Activity' && activeDownloads > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: -2,
                right: -4,
                width: 7,
                height: 7,
                borderRadius: 999,
                backgroundColor: t.err,
                borderWidth: 1.5,
                borderColor: t.bg,
              }}
            />
          ) : null}
        </View>
        <Text style={{ fontFamily: fonts.sans.medium, fontSize: 10, color }}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        backgroundColor: t.bg,
        borderTopWidth: 1,
        borderTopColor: t.border,
        paddingTop: 6,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8 }}>
        <Tab name="Home" label="Home" />
        <Tab name="Library" label="Library" />

        {/* Raised Add FAB — occupies the centre slot of five. */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Pressable
            onPress={() => navigation.navigate('Library', { screen: 'AddSeries' })}
            accessibilityRole="button"
            accessibilityLabel="Add series"
            testID="tab-add-fab"
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              marginTop: -22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.primary,
              shadowColor: t.primary,
              shadowOpacity: 0.5,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            <Plus color={t.primaryFg} size={22} strokeWidth={2} />
          </Pressable>
        </View>

        <Tab name="Activity" label="Activity" />
        <Tab name="Settings" label="Settings" />
      </View>
    </View>
  );
}
