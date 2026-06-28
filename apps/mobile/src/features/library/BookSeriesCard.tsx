import { View, Text, Pressable } from 'react-native';
import { BookCopy } from 'lucide-react-native';
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
 * Tablet grid card for a book series — mirrors FolderCard.
 *
 * Shows a single representative cover filling the 2/3 aspect-ratio tile via
 * the shared <Cover> component (gradient placeholder when coverUrl is null),
 * with a BookCopy corner badge to signal "collection". Navigates to
 * BookSeriesDetail on press.
 */
export function BookSeriesCard({ bookSeries, onPress, testID }: Props) {
  const t = useTokens();
  const hue = hueFromString(bookSeries.name);
  const subline = `${bookSeries.memberCount} ${bookSeries.memberCount === 1 ? 'BOOK' : 'BOOKS'} IN SERIES`;
  return (
    <Pressable
      testID={testID ?? `book-series-card-${bookSeries.id}`}
      onPress={onPress}
      style={{ marginBottom: 16 }}
    >
      <View
        testID={`book-series-card-cover-${bookSeries.id}`}
        style={{ position: 'relative' }}
      >
        <Cover uri={bookSeries.coverUrl} hue={hue} title={bookSeries.name} ratio={2 / 3} />
        {/* BookCopy badge: collection affordance overlaid top-left */}
        <View
          testID={`book-series-card-badge-${bookSeries.id}`}
          style={{ position: 'absolute', top: 8, left: 8 }}
        >
          <BookCopy size={15} color={t.textMuted} strokeWidth={1.7} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 2, marginTop: 8 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fonts.sans.medium,
            fontSize: 12.5,
            fontWeight: '500',
            lineHeight: 15.6,
            color: t.text,
          }}
        >
          {bookSeries.name}
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 9.5,
            letterSpacing: 0.48, // 0.05em × 9.5px
            color: t.textMuted,
            marginTop: 3,
          }}
        >
          {subline}
        </Text>
      </View>
    </Pressable>
  );
}
