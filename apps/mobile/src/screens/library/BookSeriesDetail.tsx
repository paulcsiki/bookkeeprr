import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { ChevronLeft, RefreshCw, BookPlus, Unlink, CloudOff } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { EmptyState } from '@/components/EmptyState';
import { Cover } from '@/components/Cover';
import { IconButton } from '@/components/IconButton';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { hueFromString } from '@/theme/color';
import { useBookSeries, useRefreshBookSeries, useRemoveFromBookSeries } from '@/api/hooks/useBookSeries';
import type { BookSeriesEntry } from '@/api/schemas/book-series';
import { useLayout } from '@/responsive/useLayout';
import { DETAIL_HERO_MAX_WIDTH } from '@/responsive/breakpoints';
import type { LibraryStackParamList } from '@/navigation/types';

// ─── Remove-from-series confirmation sheet ───────────────────────────────────

interface RemoveSheetProps {
  visible: boolean;
  book: BookSeriesEntry | null;
  bookSeriesId: number;
  onClose: () => void;
}

function RemoveSheet({ visible, book, bookSeriesId, onClose }: RemoveSheetProps) {
  const t = useTokens();
  const remove = useRemoveFromBookSeries();
  const [error, setError] = useState<string | null>(null);

  function onConfirm() {
    if (!book?.seriesId) return;
    setError(null);
    remove.mutate(
      { bookSeriesId, seriesId: book.seriesId },
      {
        onSuccess: () => onClose(),
        onError: () => setError("Couldn't remove from series — check the server."),
      },
    );
  }

  if (!book) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: t.scrim,
          }}
        />
        <BottomSheet testID="remove-from-series-sheet" onDismiss={onClose}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 4 }}>
            <Text
              style={{
                fontFamily: fonts.display.semibold,
                fontSize: 17,
                letterSpacing: -0.34,
                color: t.text,
                marginBottom: 6,
              }}
            >
              Remove from series?
            </Text>
            <Text
              numberOfLines={2}
              style={{
                fontFamily: fonts.mono.regular,
                fontSize: 10,
                letterSpacing: 0.5,
                color: t.textMuted,
                marginBottom: 14,
              }}
            >
              {book.title.toUpperCase()}
            </Text>
            {error !== null ? (
              <InlineAlert tone="err" body={error} testID="remove-error" />
            ) : null}
          </View>
          <View style={{ paddingHorizontal: 18, paddingTop: 10, gap: 10 }}>
            <Button
              testID="remove-confirm"
              label={remove.isPending ? 'Removing…' : 'Remove'}
              onPress={onConfirm}
              disabled={remove.isPending}
              style={{ paddingVertical: 0, height: 48, borderRadius: 13 }}
            />
          </View>
        </BottomSheet>
      </View>
    </Modal>
  );
}

// ─── Book row ────────────────────────────────────────────────────────────────

interface BookRowProps {
  book: BookSeriesEntry;
  onNavigateToSeries: (seriesId: number) => void;
  onOpenAddSeries: () => void;
  onRemove: (book: BookSeriesEntry) => void;
}

function BookRow({ book, onNavigateToSeries, onOpenAddSeries, onRemove }: BookRowProps) {
  const t = useTokens();
  const isOwned = book.owned && book.seriesId !== null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      {/* Position badge */}
      <Text
        style={{
          fontFamily: fonts.mono.regular,
          fontSize: 11,
          letterSpacing: 0.4,
          color: t.textMuted,
          width: 28,
          textAlign: 'center',
        }}
      >
        {book.position !== null ? String(book.position) : '—'}
      </Text>

      {/* Cover thumbnail */}
      <View style={{ width: 36 }}>
        <Cover
          uri={book.coverUrl}
          hue={hueFromString(book.title)}
          size="sm"
          ratio={2 / 3}
        />
      </View>

      {/* Title */}
      <Text numberOfLines={2} style={[text.label, { color: t.text, flex: 1 }]}>
        {book.title}
      </Text>

      {/* Owned: navigate to series; Missing: Add button */}
      {isOwned ? (
        <Pressable
          testID={`owned-book-${book.seriesId}`}
          accessibilityRole="button"
          accessibilityLabel={`Open ${book.title}`}
          onPress={() => onNavigateToSeries(book.seriesId!)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: t.surfaceMuted,
            borderWidth: 1,
            borderColor: t.border,
          }}
        >
          <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12, color: t.primary }}>
            View
          </Text>
        </Pressable>
      ) : (
        <Pressable
          testID="missing-book-add"
          accessibilityRole="button"
          accessibilityLabel={`Add ${book.title}`}
          onPress={onOpenAddSeries}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: t.primary,
          }}
        >
          <BookPlus size={12} color={t.primaryFg} strokeWidth={2} />
          <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12, color: t.primaryFg }}>
            Add
          </Text>
        </Pressable>
      )}

      {/* Remove from series (owned books only) */}
      {isOwned ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${book.title} from series`}
          onPress={() => onRemove(book)}
          style={{
            width: 30,
            height: 30,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Unlink size={14} color={t.textMuted} strokeWidth={1.75} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── BookSeriesDetail screen ─────────────────────────────────────────────────

export default function BookSeriesDetail() {
  const route = useRoute<RouteProp<LibraryStackParamList, 'BookSeriesDetail'>>();
  const id = Number(route.params.bookSeriesId);
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const t = useTokens();
  const { isTablet } = useLayout();

  const q = useBookSeries(id);
  const refresh = useRefreshBookSeries();

  const [removeBook, setRemoveBook] = useState<BookSeriesEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (q.isLoading) {
    return (
      <ScreenContainer testID="book-series-detail-screen">
        <View style={{ flexDirection: 'row', paddingTop: 4 }}>
          <IconButton accessibilityLabel="Back" onPress={() => navigation.goBack()}>
            <ChevronLeft size={22} color={t.text} strokeWidth={2} />
          </IconButton>
        </View>
        <View style={{ flex: 1 }} />
      </ScreenContainer>
    );
  }

  if (!q.data) {
    return (
      <ScreenContainer testID="book-series-detail-screen">
        <View style={{ flexDirection: 'row', paddingTop: 4 }}>
          <IconButton accessibilityLabel="Back" onPress={() => navigation.goBack()}>
            <ChevronLeft size={22} color={t.text} strokeWidth={2} />
          </IconButton>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            variant="err"
            icon={CloudOff}
            title="Couldn't load this series"
            body="We couldn't reach the server. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void q.refetch()}
          />
        </View>
      </ScreenContainer>
    );
  }

  const bs = q.data;

  // Sort books by position (null positions go to the end).
  const sortedBooks = [...bs.books].sort((a, b) => {
    if (a.position === null && b.position === null) return 0;
    if (a.position === null) return 1;
    if (b.position === null) return -1;
    return a.position - b.position;
  });

  const ownedCount = bs.books.filter((b) => b.owned).length;
  const totalBooks = bs.totalBooks ?? bs.books.length;

  // Hero cover: use the series cover, or fall back to the first owned book's cover.
  const heroCoverUri =
    bs.coverUrl ??
    (bs.books.find((b) => b.owned && b.coverUrl)?.coverUrl ?? null);

  function onPullRefresh() {
    setRefreshing(true);
    q.refetch().finally(() => setRefreshing(false));
  }

  function onRefreshSeries() {
    refresh.mutate({ bookSeriesId: id });
  }

  return (
    <View testID="book-series-detail-screen" style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={t.textMuted}
          />
        }
      >
        {/* Hero.
            Phone: full-bleed `flush` hero with overlaid back/refresh chrome and
            a gradient fade — the title block pulls up over it.
            Tablet: the full-bleed hero balloons to fill the wide pane, so instead
            render a normal header row (back + refresh) above a constrained,
            left-aligned poster capped at DETAIL_HERO_MAX_WIDTH. */}
        {isTablet ? (
          <>
            <SafeAreaView edges={['top']}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingHorizontal: 14,
                  paddingTop: 6,
                }}
              >
                <IconButton accessibilityLabel="Back" onPress={() => navigation.goBack()}>
                  <ChevronLeft size={20} color={t.text} strokeWidth={2} />
                </IconButton>
                <IconButton
                  accessibilityLabel="Refresh series"
                  testID="btn-refresh-series"
                  onPress={onRefreshSeries}
                  disabled={refresh.isPending}
                >
                  <RefreshCw size={16} color={t.text} strokeWidth={2} />
                </IconButton>
              </View>
            </SafeAreaView>
            <View
              testID="bs-hero"
              style={{ maxWidth: DETAIL_HERO_MAX_WIDTH, alignSelf: 'flex-start', width: '100%', paddingHorizontal: 18, paddingTop: 8 }}
            >
              <Cover uri={heroCoverUri} hue={hueFromString(bs.name)} ratio={3 / 4} />
            </View>
          </>
        ) : (
          <View testID="bs-hero">
          <Cover uri={heroCoverUri} hue={hueFromString(bs.name)} ratio={3 / 4} flush>
            <Svg style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} width="100%" height="60%">
              <Defs>
                <LinearGradient id="bshero" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={t.bg} stopOpacity={0} />
                  <Stop offset="1" stopColor={t.bg} stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#bshero)" />
            </Svg>
            <SafeAreaView
              edges={['top']}
              style={{ position: 'absolute', top: 0, left: 14, right: 14 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingTop: 6,
                }}
              >
                <IconButton onDark accessibilityLabel="Back" onPress={() => navigation.goBack()}>
                  <ChevronLeft size={18} color={t.coverTitle} strokeWidth={2} />
                </IconButton>
                <IconButton
                  onDark
                  accessibilityLabel="Refresh series"
                  testID="btn-refresh-series"
                  onPress={onRefreshSeries}
                  disabled={refresh.isPending}
                >
                  <RefreshCw size={15} color={t.coverTitle} strokeWidth={2} />
                </IconButton>
              </View>
            </SafeAreaView>
          </Cover>
          </View>
        )}

        {/* Title block. On phone it pulls up over the hero fade; on tablet the
            poster is constrained so the title sits naturally below it. */}
        <View style={{ marginTop: isTablet ? 18 : -96, paddingHorizontal: 18 }}>
          <Text
            style={{
              fontFamily: fonts.display.semibold,
              fontSize: 34,
              letterSpacing: -1,
              lineHeight: 36,
              color: t.text,
            }}
          >
            {bs.name}
          </Text>
          <Text
            style={{
              fontFamily: fonts.mono.regular,
              fontSize: 11,
              letterSpacing: 0.4,
              color: t.textMuted,
              marginTop: 8,
            }}
          >
            {bs.contentType === 'ebook' ? 'EBOOK SERIES' : 'AUDIOBOOK SERIES'}
          </Text>
        </View>

        {/* Stats strip: N books · M owned */}
        <View
          style={{
            marginHorizontal: 18,
            marginTop: 18,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: t.border,
            flexDirection: 'row',
          }}
        >
          {[
            { k: 'BOOKS', v: String(totalBooks) },
            { k: 'OWNED', v: String(ownedCount) },
            { k: 'MISSING', v: String(Math.max(0, totalBooks - ownedCount)) },
            { k: 'MEMBERS', v: String(bs.memberCount) },
          ].map((stat) => (
            <View key={stat.k} style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: fonts.mono.regular,
                  fontSize: 9,
                  letterSpacing: 1.2,
                  color: t.textMuted,
                }}
              >
                {stat.k}
              </Text>
              <Text
                testID={`bs-stat-${stat.k}`}
                style={{
                  fontFamily: fonts.display.semibold,
                  fontSize: 19,
                  letterSpacing: -0.4,
                  marginTop: 3,
                  color: t.text,
                }}
              >
                {stat.v}
              </Text>
            </View>
          ))}
        </View>

        {/* Description */}
        {bs.description ? (
          <Text
            style={[
              text.body,
              { color: t.textMuted, paddingHorizontal: 18, paddingTop: 18, lineHeight: 22 },
            ]}
          >
            {bs.description}
          </Text>
        ) : null}

        {/* Books list */}
        <View style={{ paddingHorizontal: 18, paddingTop: 18 }}>
          <Text
            style={{
              fontFamily: fonts.mono.regular,
              fontSize: 10.5,
              letterSpacing: 1.2,
              color: t.textMuted,
              marginBottom: 4,
            }}
          >
            {`BOOKS · ${totalBooks}`}
          </Text>
          {sortedBooks.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Text style={[text.bodySm, { color: t.textMuted }]}>
                No books in this series yet.
              </Text>
            </View>
          ) : (
            sortedBooks.map((book, idx) => (
              <BookRow
                key={book.externalRef ?? `${book.title}-${idx}`}
                book={book}
                onNavigateToSeries={(seriesId) =>
                  navigation.navigate('SeriesOverview', { seriesId: String(seriesId) })
                }
                onOpenAddSeries={() => navigation.navigate('AddSeries')}
                onRemove={(b) => setRemoveBook(b)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Remove-from-series confirmation sheet */}
      <RemoveSheet
        visible={removeBook !== null}
        book={removeBook}
        bookSeriesId={id}
        onClose={() => setRemoveBook(null)}
      />
    </View>
  );
}
