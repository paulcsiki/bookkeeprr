import { View, Text, ScrollView, Pressable } from 'react-native';
import FastImage from 'react-native-fast-image';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { ContentTypePill } from '@/components/Pill';
import type { OfflineItem } from '@/features/reader/lib/useOfflineDownloads';

/**
 * Horizontal rail of the user's downloaded readables (Home, offline only). A
 * sibling of ContinueReadingRail: same cover-card geometry, a content-type pill,
 * the title, and a mono `N VOLUMES` sub-label. Cover art is the cached `file://`
 * copy so it renders with no network. Returns null when empty — the Home screen
 * owns the empty-state copy.
 */
export function DownloadedRail({
  items,
  onOpen,
}: {
  items: OfflineItem[];
  onOpen: (item: OfflineItem) => void;
}) {
  const t = useTokens();
  if (items.length === 0) return null;
  return (
    <View testID="downloaded-rail" style={{ marginBottom: 16 }}>
      <Text style={[text.monoSm, { color: t.textMuted, paddingHorizontal: 18, paddingBottom: 8 }]}>
        DOWNLOADED
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 18 }}
      >
        {items.map((item) => (
          <Pressable
            key={item.readableKey}
            testID={`downloaded-card-${item.readableKey}`}
            onPress={() => onOpen(item)}
            style={{ width: 144 }}
          >
            <View
              style={{
                aspectRatio: 2 / 3,
                borderRadius: 8,
                backgroundColor: t.surfaceMuted,
                borderWidth: 1,
                borderColor: t.border,
                overflow: 'hidden',
              }}
            >
              {item.coverUrl ? (
                <FastImage
                  source={{ uri: item.coverUrl }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                />
              ) : null}
              <View style={{ position: 'absolute', top: 8, left: 8 }}>
                <ContentTypePill type={item.contentType} />
              </View>
            </View>
            <Text numberOfLines={1} style={[text.label, { color: t.text, marginTop: 6 }]}>
              {item.title}
            </Text>
            <Text style={[text.mono, { color: t.textMuted, marginTop: 4 }]}>
              {item.volumeCount} {item.volumeCount === 1 ? 'VOLUME' : 'VOLUMES'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
