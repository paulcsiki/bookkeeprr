import { View, Text, Pressable } from 'react-native';
import { BookCopy, ChevronRight } from 'lucide-react-native';
import { Cover } from '@/components/Cover';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { hueFromString } from '@/theme/color';
import type { BookSeriesSummary } from '@/api/schemas/book-series';

interface Props {
  bookSeries: BookSeriesSummary;
  onPress: () => void;
  testID?: string;
}

/**
 * Phone list row for a book series — mirrors GroupRow.
 *
 * Shows a 46×46 square tile with a single representative cover via <Cover>
 * (gradient placeholder when coverUrl is null) and a BookCopy corner badge to
 * signal "collection", then name + mono uppercase count, then a chevron.
 * Navigates to BookSeriesDetail on press.
 */
export function BookSeriesRow({ bookSeries, onPress, testID }: Props) {
  const t = useTokens();
  const hue = hueFromString(bookSeries.name);
  const subline = `${bookSeries.memberCount} ${bookSeries.memberCount === 1 ? 'BOOK' : 'BOOKS'} IN SERIES`;
  return (
    <Pressable
      testID={testID ?? `book-series-row-${bookSeries.id}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
      }}
    >
      {/* 46×46 square tile: Cover fills it; BookCopy badge overlaid top-left */}
      <View
        testID={`book-series-row-cover-${bookSeries.id}`}
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          flexShrink: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Cover uri={bookSeries.coverUrl} hue={hue} size="sm" ratio={1} flush />
        <View testID={`book-series-row-badge-${bookSeries.id}`} style={{ position: 'absolute', top: 4, left: 4 }}>
          <BookCopy size={12} color={t.textMuted} strokeWidth={1.7} />
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fonts.sans.medium,
            fontSize: 15,
            fontWeight: '500',
            color: t.text,
          }}
        >
          {bookSeries.name}
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 10,
            letterSpacing: 0.6, // 0.06em × 10px
            color: t.textMuted,
            marginTop: 3,
          }}
        >
          {subline}
        </Text>
      </View>
      <ChevronRight size={14} color={t.textMuted} strokeWidth={1.75} />
    </Pressable>
  );
}
