import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, RefreshControl } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ChevronLeft, CloudOff } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppBar } from '@/components/AppBar';
import { IconButton } from '@/components/IconButton';
import { EmptyState } from '@/components/EmptyState';
import { RiffleLoader } from '@/components/RiffleLoader';
import { useCalendar } from '@/api/hooks/useCalendar';
import { useTokens } from '@/theme/ThemeProvider';
import { formatDayHeading, parseYmd } from '@/lib/calendar';
import { DayDetail } from './DayDetail';
import type { HomeStackParamList, AppTabsParamList } from '@/navigation/types';
import { openSeriesInLibrary } from '@/navigation/openSeriesInLibrary';

/**
 * A single calendar day's releases (the phone counterpart of the web's
 * /calendar/[date] page). Reuses the month-keyed calendar query — landing here
 * from the month grid is a cache hit. Tapping a release opens the series
 * overview in the Library tab's stack.
 */
export default function CalendarDay() {
  const t = useTokens();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'CalendarDay'>>();
  const date = route.params.date;
  const cal = useCalendar(date.slice(0, 7));
  const [refreshing, setRefreshing] = useState(false);

  const entries = useMemo(
    () => (cal.data?.entries ?? []).filter((e) => e.date === date),
    [cal.data, date],
  );

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

  return (
    <ScreenContainer testID="screen-calendar-day">
      <AppBar
        large
        title={formatDayHeading(parseYmd(date))}
        subtitle={`${entries.length} RELEASE${entries.length === 1 ? '' : 'S'}`}
        leading={
          <IconButton accessibilityLabel="Back" onPress={() => nav.goBack()} testID="calendar-day-back">
            <ChevronLeft size={22} color={t.text} strokeWidth={2} />
          </IconButton>
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />}
      >
        {cal.isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <RiffleLoader unit={64} />
          </View>
        ) : cal.isError ? (
          <View style={{ paddingVertical: 24 }}>
            <EmptyState
              variant="err"
              icon={CloudOff}
              title="Couldn’t load this day"
              body="We couldn’t reach the server. Check your connection and try again."
              actionLabel="Try again"
              onAction={() => void cal.refetch()}
            />
          </View>
        ) : (
          <DayDetail entries={entries} onPressRelease={openSeries} />
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </ScreenContainer>
  );
}
