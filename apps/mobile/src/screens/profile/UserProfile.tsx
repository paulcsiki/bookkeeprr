import { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  Activity as ActivityIcon,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  Grid3x3,
  Heart,
  Trophy,
  UserX,
} from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { EmptyState } from '@/components/EmptyState';
import { Avatar } from '@/components/Avatar';
import { Cover } from '@/components/Cover';
import { ContentTypePill } from '@/components/Pill';
import { Donut } from '@/components/Donut';
import { useTokens } from '@/theme/ThemeProvider';
import type { Tokens } from '@/theme/tokens';
import { fonts, text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { useAuth } from '@/auth/AuthContext';
import { resolveAssetUri } from '@/api/asset';
import { useUserProfile } from '@/api/hooks';
import { relativeTime } from '@/features/settings/matcher/format';
import { useLayout } from '@/responsive/useLayout';
import { SplitView } from '@/responsive/SplitView';
import type { ContentType, UserProfileResponse } from '@/api/schemas';
import type { AppTabsParamList } from '@/navigation/types';
import { openSeriesInLibrary } from '@/navigation/openSeriesInLibrary';

// The screen is registered in both the Home and Settings stacks under the same
// route name, so a minimal param list keeps the hooks stack-agnostic.
type ProfileParamList = { UserProfile: { userId: number } };
type ProfileRoute = RouteProp<ProfileParamList, 'UserProfile'>;
type ProfileNav = NativeStackNavigationProp<ProfileParamList>;

function volumeLabel(
  contentType: ContentType,
  volumeNumber: number | null,
  volumeTitle: string | null,
): string | null {
  if (volumeTitle) return volumeTitle;
  if (volumeNumber != null) {
    const unit = contentType === 'comic' ? 'Issue' : 'Vol.';
    return `${unit} ${volumeNumber}`;
  }
  return null;
}

const TYPE_LABEL: Record<ContentType, string> = {
  manga: 'Manga',
  comic: 'Comics',
  novel: 'Light novels',
  ebook: 'eBooks',
  audio: 'Audiobooks',
};

function firstName(name: string): string {
  const t = name.trim();
  return t.length === 0 ? name : (t.split(/\s+/)[0] ?? name);
}

function fmtMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

/** Whole-ish hours for the big numerics (90.5 → "90.5", 90.0 → "90"). */
function fmtHours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/** Verb + tone per activity kind, content-type aware (audiobooks are
 *  listened to, not read). Mirrors the web profile's timeline copy. */
function verbFor(kind: string, type: ContentType | null, t: Tokens): { v: string; color: string } {
  const audio = type === 'audio';
  switch (kind) {
    case 'finished':
      return { v: audio ? 'Listened to' : 'Finished', color: t.ok };
    case 'started':
      return { v: audio ? 'Started listening to' : 'Started reading', color: t.info };
    case 'added':
      return { v: 'Added', color: t.primary };
    case 'imported':
      return { v: 'Imported', color: t.primary };
    case 'grabbed':
      return { v: 'Grabbed', color: t.warn };
    default:
      return { v: kind, color: t.textMuted };
  }
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

function Card({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const t = useTokens();
  return (
    <View
      testID={testID}
      style={{
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.surface,
        borderRadius: 16,
        padding: 16,
      }}
    >
      {children}
    </View>
  );
}

function StatTile({
  icon: Icon,
  value,
  unit,
  label,
  accent,
}: {
  icon: typeof Clock;
  value: string | number;
  unit: string;
  label: string;
  accent?: string | undefined;
}) {
  const t = useTokens();
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Icon size={15} color={accent ?? t.textMuted} strokeWidth={1.8} />
      <Text style={{ fontFamily: fonts.display.semibold, fontSize: 19, color: t.text }}>
        {value}
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, color: t.textMuted }}>
          {' '}
          {unit}
        </Text>
      </Text>
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

/** Solid badge (per design feedback badges never get translucent fills). */
function SolidBadge({ label, bg, fg, testID }: { label: string; bg: string; fg: string; testID?: string }) {
  return (
    <View
      testID={testID}
      style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: bg }}
    >
      <Text
        style={{
          fontFamily: fonts.mono.medium,
          fontSize: 9,
          letterSpacing: 0.9,
          textTransform: 'uppercase',
          color: fg,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── member strip ─────────────────────────────────────────────
function MemberStrip({
  members,
  currentId,
  serverUrl,
  onSelect,
}: {
  members: UserProfileResponse['members'];
  currentId: number;
  serverUrl: string;
  onSelect: (id: number) => void;
}) {
  const t = useTokens();
  if (members.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {members.map((m) => {
        const on = m.id === currentId;
        return (
          <Pressable
            key={m.id}
            testID={`profile-member-${m.id}`}
            disabled={on}
            onPress={() => onSelect(m.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              paddingVertical: 4,
              paddingLeft: 4,
              paddingRight: 11,
              borderRadius: 999,
              backgroundColor: on ? t.primary : t.surfaceMuted,
              borderWidth: 1,
              borderColor: on ? t.primary : t.border,
            }}
          >
            <Avatar size={22} name={m.name} email={m.name} avatarUrl={resolveAssetUri(serverUrl, m.avatarUrl)} />
            <Text
              style={{
                fontFamily: fonts.sans.medium,
                fontSize: 12,
                color: on ? t.primaryFg : t.text,
              }}
            >
              {firstName(m.name)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── header card ──────────────────────────────────────────────
function HeaderCard({ data, serverUrl }: { data: UserProfileResponse; serverUrl: string }) {
  const t = useTokens();
  const { member, stats, serverRank, memberCount, isYou } = data;
  return (
    <Card testID="profile-header">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar
          size={64}
          name={member.name}
          email={member.avatarSeed}
          avatarUrl={resolveAssetUri(serverUrl, member.avatarUrl)}
          testID="profile-avatar"
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fonts.display.semibold,
                fontSize: 22,
                letterSpacing: -0.5,
                color: t.text,
              }}
            >
              {member.name}
            </Text>
            {isYou ? (
              <SolidBadge testID="profile-you-badge" label="You" bg={t.primary} fg={t.primaryFg} />
            ) : null}
            <SolidBadge
              label={member.roleLabel}
              bg={member.isAdmin ? t.primary : t.surfaceMuted}
              fg={member.isAdmin ? t.primaryFg : t.textMuted}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 }}>
            <CalendarDays size={12} color={t.textMuted} strokeWidth={1.8} />
            <Text style={[text.monoSm, { color: t.textMuted }]}>Joined {member.joinedLabel}</Text>
          </View>
          {member.favType ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <Heart
                size={12}
                color={{ manga: t.manga, comic: t.comic, novel: t.novel, ebook: t.ebook, audio: t.audio }[member.favType]}
                strokeWidth={1.8}
              />
              <Text style={[text.monoSm, { color: t.textMuted }]}>
                Loves {TYPE_LABEL[member.favType].toLowerCase()}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <StatTile icon={Clock} value={fmtHours(stats.minutes)} unit="hrs" label="Total time" />
        <StatTile
          icon={CheckCircle2}
          value={stats.booksFinished}
          unit={member.favType === 'audio' ? 'listened' : 'books'}
          label="Finished"
        />
        <StatTile
          icon={Flame}
          value={stats.streakDays}
          unit="days"
          label="Streak"
          accent={stats.streakDays > 0 ? t.warn : undefined}
        />
        <StatTile icon={Trophy} value={`#${serverRank}`} unit={`of ${memberCount}`} label="Rank" />
      </View>
    </Card>
  );
}

// ── currently reading ────────────────────────────────────────
function ReadingSection({
  data,
  serverUrl,
  onOpenSeries,
}: {
  data: UserProfileResponse;
  serverUrl: string;
  onOpenSeries: (seriesId: number) => void;
}) {
  const t = useTokens();
  const { continueItems, member, isYou } = data;
  // Content-type-aware section copy: a pure-audiobook shelf is "listening".
  const allAudio = continueItems.length > 0 && continueItems.every((i) => i.contentType === 'audio');
  const verb = allAudio ? 'listening to' : 'reading';
  const title = isYou ? `You're ${verb}` : `${firstName(member.name)} is ${verb}`;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <BookOpen size={14} color={t.textMuted} strokeWidth={1.8} />
        <Eyebrow>{title}</Eyebrow>
      </View>
      <Card>
        {continueItems.length === 0 ? (
          <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center', padding: 8 }]}>
            Nothing in progress right now.
          </Text>
        ) : (
          <View style={{ gap: 14 }}>
            {continueItems.map((b) => {
              const typeColor = { manga: t.manga, comic: t.comic, novel: t.novel, ebook: t.ebook, audio: t.audio }[b.contentType];
              return (
                <Pressable
                  key={b.readableKey}
                  testID={`profile-reading-${b.seriesId}`}
                  onPress={() => onOpenSeries(b.seriesId)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <View style={{ width: 42 }}>
                    <Cover uri={resolveAssetUri(serverUrl, b.coverUrl)} title={b.title} size="sm" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Text numberOfLines={1} style={[text.label, { color: t.text, flexShrink: 1 }]}>
                        {b.title}
                      </Text>
                      <ContentTypePill type={b.contentType} size="xs" />
                    </View>
                    {(() => {
                      const vl = volumeLabel(b.contentType, b.volumeNumber, b.volumeTitle);
                      return vl ? (
                        <Text style={[text.monoSm, { color: t.textMuted, marginTop: 2 }]}>{vl}</Text>
                      ) : null;
                    })()}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 8 }}>
                      <View
                        style={{
                          height: 5,
                          flex: 1,
                          borderRadius: 999,
                          backgroundColor: withAlpha(t.text, 0.08),
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            height: '100%',
                            borderRadius: 999,
                            width: `${Math.max(0, Math.min(100, b.pct))}%`,
                            backgroundColor: typeColor,
                          }}
                        />
                      </View>
                      <Text style={[text.monoSm, { color: t.textMuted }]}>{b.pct}%</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>
    </View>
  );
}

// ── activity timeline ────────────────────────────────────────
function ActivitySection({
  data,
  onOpenSeries,
}: {
  data: UserProfileResponse;
  onOpenSeries: (seriesId: number) => void;
}) {
  const t = useTokens();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActivityIcon size={14} color={t.textMuted} strokeWidth={1.8} />
        <Eyebrow>Recent activity</Eyebrow>
      </View>
      <Card>
        {data.activity.length === 0 ? (
          <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center', padding: 8 }]}>
            Reading, finishing, and adding titles will show up here.
          </Text>
        ) : (
          <View style={{ gap: 14 }}>
            {data.activity.map((a) => {
              const verb = verbFor(a.kind, a.contentType, t);
              const body = (
                <>
                  <View style={{ width: 8, alignItems: 'center' }}>
                    <View
                      style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: verb.color, marginTop: 5 }}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={[text.bodySm, { color: t.text }]}>
                      <Text style={{ color: verb.color }}>{verb.v}</Text>{' '}
                      <Text style={{ fontFamily: fonts.sans.medium }}>{a.seriesTitle ?? 'a title'}</Text>
                    </Text>
                    {a.contentType
                      ? (() => {
                          const vl = volumeLabel(a.contentType, a.volumeNumber, a.volumeTitle);
                          return vl ? (
                            <Text style={[text.monoSm, { color: t.textMuted, marginTop: 1 }]}>{vl}</Text>
                          ) : null;
                        })()
                      : null}
                    <Text style={[text.monoSm, { color: t.textMuted, marginTop: 3 }]}>
                      {relativeTime(a.createdAt)}
                    </Text>
                  </View>
                  {a.contentType ? <ContentTypePill type={a.contentType} size="xs" /> : null}
                </>
              );
              const style = { flexDirection: 'row' as const, gap: 10, alignItems: 'flex-start' as const };
              return a.seriesId != null ? (
                <Pressable
                  key={a.id}
                  testID={`profile-activity-${a.id}`}
                  onPress={() => onOpenSeries(a.seriesId!)}
                  style={style}
                >
                  {body}
                </Pressable>
              ) : (
                <View key={a.id} testID={`profile-activity-${a.id}`} style={style}>
                  {body}
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </View>
  );
}

// ── format donut (all time) ──────────────────────────────────
function FormatSection({ data }: { data: UserProfileResponse }) {
  const t = useTokens();
  const segments = [
    { key: 'manga', color: t.manga },
    { key: 'comic', color: t.comic },
    { key: 'light_novel', color: t.novel },
    { key: 'ebook', color: t.ebook },
    { key: 'audiobook', color: t.audio },
  ].map((f) => ({ color: f.color, value: data.format.byType[f.key] ?? 0 }));
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Grid3x3 size={14} color={t.textMuted} strokeWidth={1.8} />
        <Eyebrow>By format · all time</Eyebrow>
      </View>
      <Card>
        <View style={{ alignItems: 'center', paddingVertical: 6 }}>
          <Donut segments={segments} size={140} thickness={20} track={withAlpha(t.text, 0.08)}>
            <Text style={{ fontFamily: fonts.display.semibold, fontSize: 22, color: t.text }}>
              {fmtHours(data.format.totalMinutes)}
            </Text>
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 9, letterSpacing: 1, color: t.textMuted }}>
              HOURS
            </Text>
          </Donut>
        </View>
      </Card>
    </View>
  );
}

// ── 12-week trend bars ───────────────────────────────────────
function TrendSection({ data }: { data: UserProfileResponse }) {
  const t = useTokens();
  const points = data.trend;
  const max = Math.max(1, ...points);
  const weekMins = points[points.length - 1] ?? 0;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActivityIcon size={14} color={t.textMuted} strokeWidth={1.8} />
        <Eyebrow>12-week trend</Eyebrow>
        <View style={{ flex: 1 }} />
        <Text style={[text.monoSm, { color: t.textMuted }]}>{fmtMins(weekMins)}/wk</Text>
      </View>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 64 }}>
          {points.map((m, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                borderRadius: 3,
                height: Math.max(3, Math.round((m / max) * 64)),
                backgroundColor: i === points.length - 1 ? t.primary : withAlpha(t.primary, 0.35),
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={[text.monoSm, { color: t.textMuted }]}>12W AGO</Text>
          <Text style={[text.monoSm, { color: t.textMuted }]}>NOW</Text>
        </View>
      </Card>
    </View>
  );
}

// ── last-year activity summary ───────────────────────────────
// The web shows a full 371-day heatmap here; on a phone the summary numbers
// carry the signal (the grid is mobile-hostile at any legible cell size).
function YearSection({ data }: { data: UserProfileResponse }) {
  const t = useTokens();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Flame size={14} color={t.warn} strokeWidth={1.8} />
        <Eyebrow>Reading activity · last year</Eyebrow>
      </View>
      <Card>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatTile icon={CalendarDays} value={data.activeDays} unit="days" label="Active" />
          <StatTile
            icon={Flame}
            value={data.stats.streakDays}
            unit="days"
            label="Current streak"
            accent={data.stats.streakDays > 0 ? t.warn : undefined}
          />
          <StatTile icon={Trophy} value={data.longestStreak} unit="days" label="Longest streak" />
        </View>
      </Card>
    </View>
  );
}

// ── recently finished shelf ──────────────────────────────────
function FinishedSection({
  data,
  serverUrl,
  onOpenSeries,
}: {
  data: UserProfileResponse;
  serverUrl: string;
  onOpenSeries: (seriesId: number) => void;
}) {
  const t = useTokens();
  // Audiobook-only shelves are "listened", not "read" — content-type-aware copy.
  const allAudio = data.finished.length > 0 && data.finished.every((i) => i.contentType === 'audio');
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CheckCircle2 size={14} color={t.textMuted} strokeWidth={1.8} />
        <Eyebrow>{allAudio ? 'Recently listened' : 'Recently finished'}</Eyebrow>
      </View>
      {data.finished.length === 0 ? (
        <Card>
          <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center', padding: 8 }]}>
            Completed titles will line up here.
          </Text>
        </Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {data.finished.map((b) => (
            <Pressable
              key={b.readableKey}
              testID={`profile-finished-${b.seriesId}`}
              onPress={() => onOpenSeries(b.seriesId)}
              style={{ width: 96 }}
            >
              <Cover uri={resolveAssetUri(serverUrl, b.coverUrl)} title={b.title}>
                <View style={{ position: 'absolute', top: 6, left: 6 }}>
                  <ContentTypePill type={b.contentType} size="xs" />
                </View>
              </Cover>
              <Text
                numberOfLines={1}
                style={{ fontFamily: fonts.sans.medium, fontSize: 11.5, color: t.text, marginTop: 6 }}
              >
                {b.title}
              </Text>
              {(() => {
                const vl = volumeLabel(b.contentType, b.volumeNumber, b.volumeTitle);
                return vl ? (
                  <Text numberOfLines={1} style={[text.monoSm, { color: t.textMuted, marginTop: 2 }]}>{vl}</Text>
                ) : null;
              })()}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/**
 * A household member's read-only profile dossier — lifetime reading stats,
 * what they're reading / listening to now, recent activity, format mix, and
 * the recently-finished shelf. Mirrors the web's /profile/[userId] page.
 * Reached from the dashboard's household leaderboard (any member) and from
 * Settings → Users rows (admins).
 */
export default function UserProfile() {
  const t = useTokens();
  const route = useRoute<ProfileRoute>();
  const nav = useNavigation<ProfileNav>();
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  const userId = route.params?.userId ?? 0;
  const q = useUserProfile(userId);
  const layout = useLayout();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void q.refetch().finally(() => setRefreshing(false));
  }, [q]);

  // Covers open the series in the Library tab's stack (same as the dashboard
  // rails); from either parent stack the tab navigator is one level up.
  const tabNav = nav.getParent<BottomTabNavigationProp<AppTabsParamList>>();
  const openSeries = useCallback(
    (seriesId: number): void => {
      if (tabNav) openSeriesInLibrary(tabNav, seriesId);
    },
    [tabNav],
  );

  // The member strip swaps profiles in place (push keeps back behavior sane).
  const openMember = useCallback(
    (id: number): void => {
      nav.push('UserProfile', { userId: id });
    },
    [nav],
  );

  const d = q.data;

  const head = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 12,
        gap: 10,
      }}
    >
      <Pressable testID="btn-back-profile" onPress={() => nav.goBack()} hitSlop={8}>
        <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
      </Pressable>
      <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Profile</Text>
    </View>
  );

  if (q.isError) {
    return (
      <ScreenContainer testID="screen-user-profile">
        {head}
        <View style={{ padding: 24 }} testID="profile-error">
          <EmptyState
            variant="err"
            icon={UserX}
            title="Couldn't load profile"
            body="The server didn't return this member's profile. Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void q.refetch()}
          />
        </View>
      </ScreenContainer>
    );
  }

  if (!d) {
    return (
      <ScreenContainer testID="screen-user-profile">
        {head}
        <Text
          testID="profile-loading"
          style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}
        >
          Loading…
        </Text>
      </ScreenContainer>
    );
  }

  const strip = (
    <MemberStrip members={d.members} currentId={d.member.id} serverUrl={serverUrl} onSelect={openMember} />
  );

  // The web profile is a two-column grid on desktop; tablet landscape mirrors
  // it with a SplitView (left: identity + shelves, right: timeline + charts).
  if (layout.isLandscape) {
    return (
      <ScreenContainer testID="screen-user-profile">
        {head}
        <SplitView
          testID="profile-split"
          leftFlex={1.4}
          rightFlex={1}
          left={
            <ScrollView
              contentContainerStyle={{ paddingRight: 16, paddingBottom: 32, gap: 22 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />
              }
            >
              {strip}
              <HeaderCard data={d} serverUrl={serverUrl} />
              <ReadingSection data={d} serverUrl={serverUrl} onOpenSeries={openSeries} />
              <FinishedSection data={d} serverUrl={serverUrl} onOpenSeries={openSeries} />
            </ScrollView>
          }
          right={
            <ScrollView contentContainerStyle={{ paddingLeft: 16, paddingBottom: 32, gap: 22 }}>
              <ActivitySection data={d} onOpenSeries={openSeries} />
              <FormatSection data={d} />
              <TrendSection data={d} />
              <YearSection data={d} />
            </ScrollView>
          }
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer testID="screen-user-profile">
      {head}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32, gap: 22 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />
        }
      >
        {strip}
        <HeaderCard data={d} serverUrl={serverUrl} />
        <ReadingSection data={d} serverUrl={serverUrl} onOpenSeries={openSeries} />
        <ActivitySection data={d} onOpenSeries={openSeries} />
        <FormatSection data={d} />
        <TrendSection data={d} />
        <YearSection data={d} />
        <FinishedSection data={d} serverUrl={serverUrl} onOpenSeries={openSeries} />
      </ScrollView>
    </ScreenContainer>
  );
}
