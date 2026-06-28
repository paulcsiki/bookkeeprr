import { View, Text, Pressable } from 'react-native';
import { Activity, Home, Library, Settings, type LucideIcon } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { Logo, LogoMark } from '@/components/Logo';

const TRANSPARENT = 'transparent';

export type SidebarKey = 'home' | 'library' | 'activity' | 'settings';

interface SidebarItem {
  key: SidebarKey;
  label: string;
  icon: LucideIcon;
}

// Grouped nav. Group labels are literal uppercase strings (mono captions) so
// they never collide with the item labels (e.g. "LIBRARY" vs "Library").
const GROUPS: { label: string; items: SidebarItem[] }[] = [
  {
    label: 'LIBRARY',
    items: [
      { key: 'home', label: 'Home', icon: Home },
      { key: 'library', label: 'Library', icon: Library },
      { key: 'activity', label: 'Activity', icon: Activity },
    ],
  },
  {
    label: 'SYSTEM',
    items: [{ key: 'settings', label: 'Settings', icon: Settings }],
  },
];

interface Props {
  active: SidebarKey;
  collapsed: boolean;
  onNavigate: (key: SidebarKey) => void;
  // Footer (expanded only); omitted in the bare unit-test render.
  version?: string | undefined;
  serverHost?: string | undefined;
  updateAvailable?: boolean | undefined;
}

export function TabletSidebar({
  active,
  collapsed,
  onNavigate,
  version,
  serverHost,
  updateAvailable,
}: Props) {
  const t = useTokens();
  const width = collapsed ? 64 : 232;
  const showFooter = !collapsed && version !== undefined;

  return (
    <View
      testID="tablet-sidebar"
      style={{
        flex: 1,
        width,
        backgroundColor: t.surface,
        borderRightWidth: 1,
        borderRightColor: t.border,
        paddingTop: 36,
      }}
    >
      <Pressable
        testID="sidebar-logo-home"
        accessibilityLabel="Go to home"
        onPress={() => onNavigate('home')}
        style={{
          paddingHorizontal: collapsed ? 0 : 16,
          paddingVertical: 14,
          alignItems: collapsed ? 'center' : 'flex-start',
        }}
      >
        {collapsed ? <LogoMark size={26} /> : <Logo />}
      </Pressable>

      <View style={{ flex: 1, paddingHorizontal: collapsed ? 8 : 12, gap: 2 }}>
        {GROUPS.map((group) => (
          <View key={group.label} style={{ marginTop: collapsed ? 8 : 14 }}>
            {!collapsed ? (
              <Text
                style={{
                  fontFamily: fonts.mono.regular,
                  fontSize: 9.5,
                  letterSpacing: 1.3,
                  color: t.textMuted,
                  paddingHorizontal: 12,
                  paddingBottom: 6,
                }}
              >
                {group.label}
              </Text>
            ) : null}
            {group.items.map((it) => {
              const isActive = it.key === active;
              const Icon = it.icon;
              return (
                <Pressable
                  key={it.key}
                  testID={`sidebar-${it.key}`}
                  onPress={() => onNavigate(it.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 10,
                    paddingHorizontal: collapsed ? 0 : 12,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    borderRadius: 10,
                    backgroundColor: isActive ? t.surfaceMuted : TRANSPARENT,
                  }}
                >
                  <Icon size={18} color={isActive ? t.primary : t.textMuted} strokeWidth={1.75} />
                  {!collapsed ? (
                    <Text style={[text.label, { color: isActive ? t.text : t.textMuted, flex: 1 }]}>
                      {it.label}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {showFooter ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 16,
            borderTopWidth: 1,
            borderTopColor: t.border,
            gap: 6,
          }}
        >
          {updateAvailable ? (
            <View
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 8,
                height: 22,
                borderRadius: 999,
                backgroundColor: withAlpha(t.primary, 0.16),
                borderWidth: 1,
                borderColor: withAlpha(t.primary, 0.35),
              }}
            >
              <View
                style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: t.primary }}
              />
              <Text
                style={{
                  fontFamily: fonts.mono.regular,
                  fontSize: 9.5,
                  letterSpacing: 0.6,
                  color: t.primary,
                }}
              >
                UPDATE
              </Text>
            </View>
          ) : null}
          {serverHost ? (
            <Text
              numberOfLines={1}
              style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, color: t.textMuted }}
            >
              {serverHost}
            </Text>
          ) : null}
          <Text
            style={{
              fontFamily: fonts.mono.regular,
              fontSize: 10.5,
              letterSpacing: 0.4,
              color: t.textMuted,
            }}
          >
            v{version}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
