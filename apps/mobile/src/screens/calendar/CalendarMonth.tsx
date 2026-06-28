import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CalendarDays, ChevronLeft, ChevronRight, CloudOff } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppBar } from '@/components/AppBar';
import { IconButton } from '@/components/IconButton';
import { EmptyState } from '@/components/EmptyState';
import { RiffleLoader } from '@/components/RiffleLoader';
import { SplitView } from '@/responsive/SplitView';
import { useLayout } from '@/responsive/useLayout';
import { useCalendar } from '@/api/hooks/useCalendar';
import { useTokens } from '@/theme/ThemeProvider';
import { withAlpha } from '@/theme/color';
import { fonts } from '@/theme/typography';
import {
  DOW,
  addMonthsUtc,
  bucketByDay,
  formatDayHeading,
  formatMonthHeading,
  monthGridDays,
  monthKey,
  parseMonthKey,
  parseYmd,
  todayUtc,
  ymd,
} from '@/lib/calendar';
import { DayDetail } from './DayDetail';
import type { CalendarEntry, ContentType } from '@/api/schemas';
import type { HomeStackParamList, AppTabsParamList } from '@/navigation/types';
import { openSeriesInLibrary } from '@/navigation/openSeriesInLibrary';

const CELL_HEIGHT = 56;
const TYPE_ORDER: readonly ContentType[] = ['manga', 'novel', 'comic', 'ebook', 'audio'];
const TYPE_LABEL: Record<ContentType, string> = {
  manga: 'Manga',
  novel: 'Novel',
  comic: 'Comic',
  ebook: 'eBook',
  audio: 'Audio',
};

function typeColor(type: ContentType, t: ReturnType<typeof useTokens>): string {
  return { manga: t.manga, novel: t.novel, comic: t.comic, ebook: t.ebook, audio: t.audio }[type];
}

/**
 * Native release calendar (parity with the web /calendar page): a 7-column
 * month grid of the monitored series' upcoming volume releases. Day cells
 * carry one dot per release tinted by content type; today gets a primary
 * ring. Phone: tapping a day with releases pushes the CalendarDay screen
 * (mirroring the web's /calendar/[date] navigation). Tablet landscape: the
 * grid and the selected day's detail render side by side in a SplitView.
 */
export default function CalendarMonth() {
  const t = useTokens();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const layout = useLayout();
  const split = layout.isTablet && layout.isLandscape;

  const [month, setMonth] = useState<string>(() => monthKey(todayUtc()));
  const [selected, setSelected] = useState<string>(() => ymd(todayUtc()));
  const cal = useCalendar(month);
  const [refreshing, setRefreshing] = useState(false);

  const entries = useMemo(() => cal.data?.entries ?? [], [cal.data]);
  const buckets = useMemo(() => bucketByDay(entries), [entries]);
  const monthStart = parseMonthKey(month);
  const days = useMemo(() => monthGridDays(parseMonthKey(month)), [month]);
  const todayStr = ymd(todayUtc());
  const monthCount = entries.filter((e) => e.date.startsWith(month)).length;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void cal.refetch().finally(() => setRefreshing(false));
  }, [cal]);

  // Cross-tab navigation to the series overview, following the dashboard's
  // openSeries precedent (rails → Library tab's stack via the parent tab nav).
  const tabNav = nav.getParent<BottomTabNavigationProp<AppTabsParamList>>();
  const openSeries = (seriesId: number): void => {
    if (tabNav) openSeriesInLibrary(tabNav, seriesId);
  };

  const onSelectDay = (date: string): void => {
    if (split) setSelected(date);
    else nav.navigate('CalendarDay', { date });
  };

  const selectedEntries: CalendarEntry[] = entries.filter((e) => e.date === selected);

  const monthHeader = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4, paddingBottom: 14 }}>
      <IconButton accessibilityLabel="Previous month" testID="cal-prev" onPress={() => setMonth(monthKey(addMonthsUtc(monthStart, -1)))}>
        <ChevronLeft size={18} color={t.text} strokeWidth={2} />
      </IconButton>
      <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
        <Text style={{ fontFamily: fonts.display.semibold, fontSize: 19, letterSpacing: -0.28, color: t.text }}>
          {formatMonthHeading(monthStart)}
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 9,
            letterSpacing: 0.9,
            textTransform: 'uppercase',
            color: t.textMuted,
          }}
        >
          {monthCount} release{monthCount === 1 ? '' : 's'} this month
        </Text>
      </View>
      <IconButton accessibilityLabel="Next month" testID="cal-next" onPress={() => setMonth(monthKey(addMonthsUtc(monthStart, 1)))}>
        <ChevronRight size={18} color={t.text} strokeWidth={2} />
      </IconButton>
    </View>
  );

  const grid = (
    <View
      style={{
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.surface,
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      {/* Day-of-week bar */}
      <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}>
        {DOW.map((d) => (
          <Text
            key={d}
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: fonts.mono.regular,
              fontSize: 9,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: t.textMuted,
            }}
          >
            {d}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((d, idx) => {
          const dayStr = ymd(d);
          const inMonth = d.getUTCMonth() === monthStart.getUTCMonth();
          const isRightCol = (idx + 1) % 7 === 0;
          const isBottomRow = idx >= 35;
          const cellBorders = {
            borderRightWidth: isRightCol ? 0 : 1,
            borderBottomWidth: isBottomRow ? 0 : 1,
            borderColor: t.border,
          } as const;

          if (!inMonth) {
            return (
              <View
                key={dayStr}
                accessibilityElementsHidden
                style={{ width: `${100 / 7}%`, height: CELL_HEIGHT, backgroundColor: t.bg, ...cellBorders }}
              />
            );
          }

          const bucket = buckets.get(dayStr);
          const dayEntries = bucket?.entries ?? [];
          const hasReleases = dayEntries.length > 0;
          const isToday = dayStr === todayStr;
          const isSelected = split && dayStr === selected;

          return (
            <Pressable
              key={dayStr}
              testID={`cal-day-${dayStr}`}
              accessibilityRole="button"
              accessibilityLabel={`${dayEntries.length} release${dayEntries.length === 1 ? '' : 's'} on ${dayStr}`}
              disabled={!split && !hasReleases}
              onPress={() => onSelectDay(dayStr)}
              style={{
                width: `${100 / 7}%`,
                height: CELL_HEIGHT,
                paddingTop: 7,
                alignItems: 'center',
                gap: 5,
                backgroundColor: isSelected ? withAlpha(t.primary, 0.1) : undefined,
                ...cellBorders,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: isToday ? 1.5 : 0,
                  borderColor: t.primary,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.mono.regular,
                    fontSize: 11,
                    color: isToday ? t.primary : hasReleases ? t.text : t.textMuted,
                  }}
                >
                  {d.getUTCDate()}
                </Text>
              </View>
              {hasReleases ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  {dayEntries.slice(0, 3).map((e) => (
                    <View
                      key={e.volumeId}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        backgroundColor: typeColor(e.contentType, t),
                      }}
                    />
                  ))}
                  {dayEntries.length > 3 ? (
                    <Text style={{ fontFamily: fonts.mono.regular, fontSize: 8, color: t.textMuted }}>
                      +{dayEntries.length - 3}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const legend = (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 14,
        paddingTop: 12,
        paddingHorizontal: 4,
      }}
    >
      {TYPE_ORDER.map((type) => (
        <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: typeColor(type, t) }} />
          <Text
            style={{
              fontFamily: fonts.mono.regular,
              fontSize: 9,
              letterSpacing: 0.9,
              textTransform: 'uppercase',
              color: t.textMuted,
            }}
          >
            {TYPE_LABEL[type]}
          </Text>
        </View>
      ))}
    </View>
  );

  const body = cal.isLoading ? (
    <View style={{ paddingVertical: 48, alignItems: 'center' }}>
      <RiffleLoader unit={64} />
    </View>
  ) : cal.isError ? (
    <View style={{ paddingVertical: 24 }}>
      <EmptyState
        variant="err"
        icon={CloudOff}
        title="Couldn’t load the calendar"
        body="We couldn’t reach the server. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void cal.refetch()}
      />
    </View>
  ) : (
    <View>
      {grid}
      {legend}
      {monthCount === 0 ? (
        <View style={{ paddingTop: 20 }}>
          <EmptyState
            variant="muted"
            icon={CalendarDays}
            title="Nothing scheduled"
            body="No releases from your monitored series fall in this month."
          />
        </View>
      ) : null}
    </View>
  );

  const monthPane = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />}
    >
      {monthHeader}
      {body}
      <View style={{ height: 24 }} />
    </ScrollView>
  );

  if (split) {
    return (
      <ScreenContainer testID="screen-calendar" style={{ paddingHorizontal: 0 }}>
        <View style={{ paddingHorizontal: 28 }}>
          <AppBar
            large
            title="Calendar"
            subtitle="UPCOMING RELEASES"
            leading={
              <IconButton accessibilityLabel="Back" onPress={() => nav.goBack()} testID="calendar-back">
                <ChevronLeft size={22} color={t.text} strokeWidth={2} />
              </IconButton>
            }
          />
        </View>
        <SplitView
          testID="calendar-split"
          left={<View style={{ flex: 1, paddingHorizontal: 28 }}>{monthPane}</View>}
          right={
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 24 }}
            >
              <View style={{ paddingTop: 8, paddingBottom: 12, gap: 3 }}>
                <Text style={{ fontFamily: fonts.display.semibold, fontSize: 19, letterSpacing: -0.28, color: t.text }}>
                  {formatDayHeading(parseYmd(selected))}
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.mono.regular,
                    fontSize: 9,
                    letterSpacing: 0.9,
                    textTransform: 'uppercase',
                    color: t.textMuted,
                  }}
                >
                  {selectedEntries.length} release{selectedEntries.length === 1 ? '' : 's'}
                </Text>
              </View>
              <DayDetail entries={selectedEntries} onPressRelease={openSeries} />
            </ScrollView>
          }
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer testID="screen-calendar">
      <AppBar
        large
        title="Calendar"
        subtitle="UPCOMING RELEASES"
        leading={
          <IconButton accessibilityLabel="Back" onPress={() => nav.goBack()} testID="calendar-back">
            <ChevronLeft size={22} color={t.text} strokeWidth={2} />
          </IconButton>
        }
      />
      {monthPane}
    </ScreenContainer>
  );
}
