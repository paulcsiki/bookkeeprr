import { View, Text, Pressable } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';

export type ActivityTab = 'downloading' | 'history' | 'blocked';

interface Props {
  active: ActivityTab;
  onChange: (next: ActivityTab) => void;
  counts: Record<ActivityTab, number>;
}

const ORDER: ActivityTab[] = ['downloading', 'history', 'blocked'];
const LABEL: Record<ActivityTab, string> = {
  downloading: 'Downloading',
  history: 'History',
  blocked: 'Blocked',
};

const TRANSPARENT = 'transparent';

export function ActivityTabs({ active, onChange, counts }: Props) {
  const t = useTokens();
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      {ORDER.map((tab) => {
        const isActive = active === tab;
        return (
          <Pressable
            key={tab}
            testID={`tab-${tab}`}
            onPress={() => onChange(tab)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 4,
              marginRight: 20,
              borderBottomWidth: 2,
              borderBottomColor: isActive ? t.primary : TRANSPARENT,
            }}
          >
            <Text style={[text.label, { color: isActive ? t.text : t.textMuted }]}>
              {LABEL[tab]}
              <Text
                style={[text.monoSm, { color: isActive ? t.primary : t.textMuted, marginLeft: 6 }]}
              >
                {' '}
                {counts[tab]}
              </Text>
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
