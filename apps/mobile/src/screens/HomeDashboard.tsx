import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, RefreshControl, AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Compass,
  Clock,
  BookOpen,
  Check,
  Flame,
  Target,
  Grid3x3,
  Trophy,
  CalendarClock,
  CalendarDays,
  Sparkles,
  Server,
  Users,
  SlidersHorizontal,
  CloudOff,
} from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppBar } from '@/components/AppBar';
import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { useProfile } from '@/state/profileStore';
import { Cover } from '@/components/Cover';
import { ContentTypePill } from '@/components/Pill';
import { Donut } from '@/components/Donut';
import { Ring } from '@/components/Ring';
import { ContinueReadingRail } from '@/features/library/ContinueReadingRail';
import { DownloadedRail } from '@/features/library/DownloadedRail';
import { OfflineSection } from '@/features/system/OfflineSection';
import { useIsOnline, OnlineOnly, useOnlineGate } from '@/features/system/online';
import { useOfflineHomeItems, offlineReaderParams } from '@/features/system/offlineContent';
import { EmptyState } from '@/components/EmptyState';
import { CustomizeSheet } from '@/features/dashboard/CustomizeSheet';
import { useDashboard } from '@/api/hooks/useDashboard';
import { useContinueReading } from '@/api/hooks/useContinueReading';
import { useDashboardPrefs } from '@/api/hooks/useDashboardPrefs';
import type { OfflineItem } from '@/features/reader/lib/useOfflineDownloads';
import { useTokens } from '@/theme/ThemeProvider';
import { withAlpha } from '@/theme/color';
import { fonts } from '@/theme/typography';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ContentType } from '@/api/schemas';
import type { HomeStackParamList, AppTabsParamList } from '@/navigation/types';
import { openSeriesInLibrary, openReaderInLibrary } from '@/navigation/openSeriesInLibrary';

const HUE: Record<ContentType, number> = { manga: 12, novel: 220, comic: 45, ebook: 160, audio: 290 };

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function firstName(name: string | null | undefined): string {
  if (!name) return 'reader';
  return name.split(/\s+/)[0] ?? name;
}
function fmtMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function Eyebrow({ children }: { children: string }) {
  const t = useTokens();
  return (
    <Text
      style={{
        fontFamily: fonts.mono.regular,
        fontSize: 11,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: t.textMuted,
      }}
    >
      {children}
    </Text>
  );
}

function MdCard({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View
      style={{ borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, borderRadius: 16, padding: 16 }}
    >
      {children}
    </View>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Clock;
  value: string | number;
  label: string;
  accent?: string | undefined;
}) {
  const t = useTokens();
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Icon size={15} color={accent ?? t.textMuted} strokeWidth={1.8} />
      <Text style={{ fontFamily: fonts.display.semibold, fontSize: 19, color: t.text }}>{value}</Text>
      <Text
        style={{
          fontFamily: fonts.mono.regular,
          fontSize: 9,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: t.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function GoalRing({ value, max, label, sub, color }: { value: number; max: number; label: string; sub: string; color: string }) {
  const t = useTokens();
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 }}>
      <Ring value={value} max={max} size={72} thickness={8} color={color} track={withAlpha(t.text, 0.08)}>
        <Text style={{ fontFamily: fonts.display.semibold, fontSize: 15, color: t.text }}>{pct}%</Text>
      </Ring>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.sans.medium, fontSize: 13.5, color: t.text }}>{label}</Text>
        <Text style={{ fontFamily: fonts.sans.regular, fontSize: 12, color: t.textMuted, marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );
}

interface RailCard {
  key: string;
  title: string;
  sub: string;
  contentType: ContentType;
  coverUrl: string | null;
  soon?: boolean;
  onPress?: () => void;
}

/** A horizontal rail of cover cards (recently added / upcoming releases). */
function CoverRail({ items }: { items: RailCard[] }) {
  const t = useTokens();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
      {items.map((it) => (
        <Pressable key={it.key} onPress={it.onPress} style={{ width: 118 }}>
          <Cover uri={it.coverUrl} hue={HUE[it.contentType]} title={it.title}>
            <View style={{ position: 'absolute', top: 7, left: 7 }}>
              <ContentTypePill type={it.contentType} size="xs" />
            </View>
          </Cover>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sans.medium, fontSize: 12, color: t.text, marginTop: 6 }}>
            {it.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: fonts.mono.regular,
              fontSize: 9,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              color: it.soon ? t.warn : t.textMuted,
              marginTop: 2,
            }}
          >
            {it.sub}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * Mobile Home (Dashboard) — greeting + Discover entry, Continue-reading rail,
 * and the full widget set (reading stats, goals, by-format, leaderboard,
 * upcoming releases, recently added, server totals) backed by /api/dashboard.
 */
export default function HomeDashboard() {
  const t = useTokens();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const dash = useDashboard('week');
  const prefs = useDashboardPrefs();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();
  const offlineItems = useOfflineHomeItems();
  const cr = useContinueReading();
  // Treat a paused/undefined Continue Reading query as "unknown", NOT empty:
  // offline the query is paused (data === undefined), and counting that as
  // empty would show the "Nothing downloaded yet" hint beside a populated
  // (cached) Continue Reading rail. Only genuinely-loaded, in-progress-free
  // data counts as empty.
  const continueEmpty =
    cr.data != null &&
    cr.data.items.filter((i) => !i.finished && i.position < 0.999).length === 0;
  const qc = useQueryClient();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Refresh everything the dashboard shows: its own widgets data, prefs, and the
  // continue-reading rail (separate query). Shared by pull-to-refresh and the
  // app-foreground handler.
  const refreshAll = useCallback(() => {
    return Promise.all([
      dash.refetch(),
      prefs.refetch(),
      qc.invalidateQueries({ queryKey: ['continue-reading'] }),
    ]);
  }, [dash, prefs, qc]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refreshAll().finally(() => setRefreshing(false));
  }, [refreshAll]);

  // Refresh when the app returns to the foreground (stats/progress may have
  // changed on another device while it was backgrounded).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') void refreshAll();
    });
    return () => sub.remove();
  }, [refreshAll]);

  const d = dash.data;
  // The cached profile (offline-safe, persisted) is the primary source for the
  // greeting + avatar; the dashboard's `greetingName` is only a last-resort
  // fallback for a brand-new install with an empty profile cache (and is
  // undefined offline anyway).
  const profile = useProfile();
  const name = firstName(profile.displayName ?? profile.username ?? d?.greetingName);
  // A widget shows unless it's been explicitly disabled (prefs shared with web).
  const on = (id: string): boolean => prefs.data?.enabled[id] !== false;

  const cur = d?.personal.current;
  const g = d?.goals;
  const track = withAlpha(t.text, 0.08);

  const fmt = d
    ? [
        { key: 'manga', color: t.manga },
        { key: 'comic', color: t.comic },
        { key: 'light_novel', color: t.novel },
        { key: 'ebook', color: t.ebook },
        { key: 'audiobook', color: t.audio },
      ].map((f) => ({ color: f.color, value: d.format.byType[f.key] ?? 0 }))
    : [];
  const fmtHours = d ? Math.round((d.format.totalMinutes / 60) * 10) / 10 : 0;

  const leaders = d?.leaderboard.time ?? [];
  const showLeaderboard = (d?.memberCount ?? 0) > 1 && leaders.length > 0;

  // Cover-rail items. Tapping opens the series in the Library tab's stack.
  const tabNav = nav.getParent<BottomTabNavigationProp<AppTabsParamList>>();
  const openSeries = (seriesId: number): void => {
    if (tabNav) openSeriesInLibrary(tabNav, seriesId);
  };
  // Downloaded cards open the Reader via the Library tab's stack (same as openSeries).
  const openDownloaded = (item: OfflineItem): void => {
    if (tabNav) openReaderInLibrary(tabNav, offlineReaderParams(item.readableKey));
  };
  const releaseCards: RailCard[] = (d?.releases ?? []).map((r) => ({
    key: `rel${r.volumeId}`,
    title: r.title,
    sub: `${r.whenLabel} · ${r.detail}`,
    contentType: r.contentType,
    coverUrl: r.coverUrl,
    soon: r.soon,
    onPress: () => openSeries(r.seriesId),
  }));
  const recentCards: RailCard[] = (d?.recent ?? []).map((r) => ({
    key: `rec${r.seriesId}`,
    title: r.title,
    sub: r.author ?? '',
    contentType: r.contentType,
    coverUrl: r.coverUrl,
    onPress: () => openSeries(r.seriesId),
  }));
  const srv = d?.server;

  return (
    <ScreenContainer testID="screen-home">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />
        }
      >
        <AppBar
          large
          trailingBelow
          title={`${greeting()}, ${name}`}
          subtitle="YOUR READING ROOM"
          trailing={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pressable
                accessibilityLabel="Open your profile"
                accessibilityRole="button"
                onPress={gate(() => {
                  if (profile.id != null) nav.navigate('UserProfile', { userId: profile.id });
                })}
                disabled={disabledProps.disabled}
                testID="home-avatar-btn"
                style={{ marginRight: 6, opacity: disabledProps.disabled ? 0.45 : 1 }}
              >
                <Avatar
                  size={36}
                  name={profile.displayName ?? profile.username ?? 'reader'}
                  email={profile.email ?? ''}
                  avatarLocalPath={profile.avatarLocalPath}
                  testID="home-avatar"
                />
              </Pressable>
              <IconButton
                accessibilityLabel="Customize dashboard"
                onPress={gate(() => setCustomizeOpen(true))}
                disabled={disabledProps.disabled}
                testID="home-customize"
              >
                <SlidersHorizontal size={19} color={t.textMuted} strokeWidth={1.9} />
              </IconButton>
              <IconButton accessibilityLabel="Calendar" onPress={gate(() => nav.navigate('Calendar'))} disabled={disabledProps.disabled} testID="home-calendar">
                <CalendarDays size={19} color={t.textMuted} strokeWidth={1.9} />
              </IconButton>
              <IconButton accessibilityLabel="Discover" onPress={gate(() => nav.navigate('Discover'))} disabled={disabledProps.disabled} testID="home-discover">
                <Compass size={20} color={t.primary} strokeWidth={1.9} />
              </IconButton>
            </View>
          }
        />

        {on('continue') && <ContinueReadingRail />}

        {!online && <DownloadedRail items={offlineItems} onOpen={openDownloaded} />}
        {!online && offlineItems.length === 0 && continueEmpty ? (
          <View style={{ paddingTop: 48, paddingHorizontal: 24 }}>
            <EmptyState
              variant="primary"
              icon={CloudOff}
              title="Nothing downloaded yet"
              body="Download volumes while you're online to read them here."
            />
          </View>
        ) : null}

        <OnlineOnly
          fallback={
            <OfflineSection
              title="Stats & releases are back online"
              sub="Reconnect to see your reading stats, goals, and upcoming releases."
            />
          }
        >
        {/* Your reading */}
        {on('personal') && (
        <View style={{ marginTop: 22, gap: 12 }}>
          <Eyebrow>Your reading · this week</Eyebrow>
          <MdCard>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatTile icon={Clock} value={fmtMins(cur?.minutes ?? 0)} label="Time read" />
              <StatTile icon={BookOpen} value={cur?.units ?? 0} label="Units" />
              <StatTile icon={Check} value={cur?.booksFinished ?? 0} label="Finished" />
              <StatTile
                icon={Flame}
                value={cur?.streakDays ?? 0}
                label="Streak"
                accent={(cur?.streakDays ?? 0) > 0 ? t.warn : undefined}
              />
            </View>
          </MdCard>
        </View>
        )}

        {/* Reading goals */}
        {on('goals') && g && (g.goals.yearlyBooks != null || g.goals.weeklyMinutes != null || g.goals.streakDays != null) && (
          <View style={{ marginTop: 22, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Target size={14} color={t.textMuted} strokeWidth={1.8} />
              <Eyebrow>Reading goals</Eyebrow>
            </View>
            <MdCard>
              <View style={{ gap: 6 }}>
                {g.goals.yearlyBooks != null && (
                  <GoalRing
                    value={g.yearBooksDone}
                    max={g.goals.yearlyBooks}
                    label={`${new Date().getFullYear()} books`}
                    sub={`${g.yearBooksDone} of ${g.goals.yearlyBooks}`}
                    color={t.primary}
                  />
                )}
                {g.goals.weeklyMinutes != null && (
                  <GoalRing
                    value={g.weekMinutesDone}
                    max={g.goals.weeklyMinutes}
                    label="Weekly time goal"
                    sub={`${fmtMins(g.weekMinutesDone)} of ${fmtMins(g.goals.weeklyMinutes)}`}
                    color={t.ok}
                  />
                )}
                {g.goals.streakDays != null && (
                  <GoalRing
                    value={g.streakDays}
                    max={g.goals.streakDays}
                    label="Reading streak"
                    sub={`${g.streakDays} of ${g.goals.streakDays} days`}
                    color={t.warn}
                  />
                )}
              </View>
            </MdCard>
          </View>
        )}

        {/* By format */}
        {on('format') && (
        <View style={{ marginTop: 22, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Grid3x3 size={14} color={t.textMuted} strokeWidth={1.8} />
            <Eyebrow>By format · this week</Eyebrow>
          </View>
          <MdCard>
            <View style={{ alignItems: 'center', paddingVertical: 6 }}>
              <Donut segments={fmt} size={140} thickness={20} track={track}>
                <Text style={{ fontFamily: fonts.display.semibold, fontSize: 22, color: t.text }}>{fmtHours}</Text>
                <Text style={{ fontFamily: fonts.mono.regular, fontSize: 9, letterSpacing: 1, color: t.textMuted }}>
                  HOURS
                </Text>
              </Donut>
            </View>
          </MdCard>
        </View>
        )}

        {/* Household leaderboard */}
        {on('leaderboard') && showLeaderboard && (
          <View style={{ marginTop: 22, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Trophy size={14} color={t.textMuted} strokeWidth={1.8} />
              <Eyebrow>Household leaderboard</Eyebrow>
            </View>
            <MdCard>
              <View style={{ gap: 12 }}>
                {leaders.slice(0, 5).map((e, i) => (
                  <Pressable
                    key={e.userId}
                    testID={`leaderboard-row-${e.userId}`}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${e.displayName}'s profile`}
                    onPress={() => nav.navigate('UserProfile', { userId: e.userId })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <Text style={{ fontFamily: fonts.mono.regular, fontSize: 12, color: t.textMuted, width: 16 }}>
                      {i + 1}
                    </Text>
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 99,
                        backgroundColor: withAlpha(t.primary, 0.18),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontFamily: fonts.sans.medium, fontSize: 11, color: t.primary }}>
                        {e.displayName.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ flex: 1, fontFamily: fonts.sans.medium, fontSize: 13.5, color: t.text }} numberOfLines={1}>
                      {e.displayName}
                    </Text>
                    <Text style={{ fontFamily: fonts.mono.regular, fontSize: 12.5, color: t.text }}>
                      {fmtMins(e.value)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </MdCard>
          </View>
        )}

        {/* Upcoming releases */}
        {on('releases') && releaseCards.length > 0 && (
          <View style={{ marginTop: 22, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CalendarClock size={14} color={t.textMuted} strokeWidth={1.8} />
              <Eyebrow>Upcoming releases</Eyebrow>
            </View>
            <CoverRail items={releaseCards} />
          </View>
        )}

        {/* Recently added */}
        {on('recent') && recentCards.length > 0 && (
          <View style={{ marginTop: 22, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Sparkles size={14} color={t.textMuted} strokeWidth={1.8} />
              <Eyebrow>Recently added</Eyebrow>
            </View>
            <CoverRail items={recentCards} />
          </View>
        )}

        {/* Across your server */}
        {on('server') && srv && (
          <View style={{ marginTop: 22, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Server size={14} color={t.textMuted} strokeWidth={1.8} />
              <Eyebrow>{`Across your server · ${srv.totalMembers} ${srv.totalMembers === 1 ? 'member' : 'members'}`}</Eyebrow>
            </View>
            <MdCard>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <StatTile icon={Users} value={srv.activeReaders} label="Active" />
                <StatTile icon={Clock} value={fmtMins(srv.minutes)} label="Time" />
                <StatTile icon={Check} value={srv.booksFinished} label="Finished" />
                <StatTile icon={BookOpen} value={srv.units} label="Units" />
              </View>
            </MdCard>
          </View>
        )}
        </OnlineOnly>

        <View style={{ height: 24 }} />
      </ScrollView>
      <CustomizeSheet open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
    </ScreenContainer>
  );
}
