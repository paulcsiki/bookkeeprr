import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { CheckCircle2, CloudOff } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { EmptyState } from '@/components/EmptyState';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { useDownloads, useDeleteDownload } from '@/api/hooks';
import { ActivityTabs, type ActivityTab } from '@/features/activity/Tabs';
import { QueueRow } from '@/features/activity/QueueRow';
import { HistoryRow } from '@/features/activity/HistoryRow';
import { SwipeToDelete } from '@/features/activity/SwipeToDelete';
import { AggregateSpeedStrip } from '@/features/activity/AggregateSpeedStrip';
import type { Download } from '@/api/schemas';

/** Newest first, with a stable id tiebreak so the 5s background refetch can't
 * reshuffle equal-timestamp rows under the user's finger. */
function byNewest(a: Download, b: Download): number {
  return b.addedAt.localeCompare(a.addedAt) || b.id - a.id;
}
import { useLayout } from '@/responsive/useLayout';
import { SplitView } from '@/responsive/SplitView';
import { useIsOnline, useOnlineGate } from '@/features/system/online';

const TRANSPARENT = 'transparent';

function isQueue(d: Download): boolean {
  return d.status === 'queued' || d.status === 'downloading' || d.status === 'importing';
}

function isHistory(d: Download): boolean {
  // Catch-all "done" bucket: anything that isn't actively in flight or blocked.
  // This covers `imported`, `completed`, the terminal `superseded` (a redundant
  // sibling the server cancelled), AND any unknown future status (forward-compat,
  // see DownloadStatus) — so a status this build doesn't recognise still surfaces
  // here instead of vanishing from every tab.
  return !isQueue(d) && !isBlocked(d);
}

function isBlocked(d: Download): boolean {
  return d.status === 'failed';
}

export default function Activity() {
  const t = useTokens();
  const [tab, setTab] = useState<ActivityTab>('downloading');
  // Tablet right-pane toggle: History vs Blocked. The wide layout has no tab
  // bar, so this segmented control is the only way to reach blocked items there.
  const [tabletRight, setTabletRight] = useState<'history' | 'blocked'>('history');
  const q = useDownloads();
  const del = useDeleteDownload();
  const online = useIsOnline();
  const { gate } = useOnlineGate();
  // Cancel/remove is a mutation — it does NOT pause offline like queries do, so
  // gate it actively: offline taps toast "Unavailable offline" and no-op.
  const gatedDelete = gate((hash: string) => del.mutate(hash));
  const offlineCard = (
    <View style={{ padding: 24 }}>
      <EmptyState
        variant="muted"
        icon={CloudOff}
        title="You're offline"
        body="Reconnect to view the download queue."
      />
    </View>
  );
  // Manual pull-to-refresh state, kept separate from `q.isFetching` so the
  // background 5s poll doesn't flash the refresh spinner / jiggle the list.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void q.refetch().finally(() => setRefreshing(false));
  }, [q]);
  const rows = useMemo(() => q.data?.downloads ?? [], [q.data]);
  const counts = useMemo(
    () => ({
      downloading: rows.filter(isQueue).length,
      history: rows.filter(isHistory).length,
      blocked: rows.filter(isBlocked).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const pred = tab === 'downloading' ? isQueue : tab === 'history' ? isHistory : isBlocked;
    return rows.filter(pred).slice().sort(byNewest);
  }, [rows, tab]);

  const layout = useLayout();

  if (layout.isLandscape) {
    // Offline + no cache: skip the split and show the offline card (keep the
    // title header + screen testID). Cached data still renders the split below.
    if (!online && !q.data) {
      return (
        <ScreenContainer testID="screen-activity">
          <View style={{ paddingTop: 16, paddingBottom: 10 }}>
            <Text
              style={{
                fontFamily: fonts.display.semibold,
                fontSize: 28,
                letterSpacing: -0.7,
                color: t.text,
              }}
            >
              Activity
            </Text>
          </View>
          {offlineCard}
        </ScreenContainer>
      );
    }
    const queue = rows.filter(isQueue).slice().sort(byNewest);
    const history = rows.filter(isHistory).slice().sort(byNewest);
    const blocked = rows.filter(isBlocked).slice().sort(byNewest);
    const rightItems = tabletRight === 'history' ? history : blocked;
    return (
      <ScreenContainer testID="screen-activity">
        <View style={{ paddingTop: 16, paddingBottom: 10 }}>
          <Text
          style={{
            fontFamily: fonts.display.semibold,
            fontSize: 28,
            letterSpacing: -0.7,
            color: t.text,
          }}
        >
          Activity
        </Text>
          <Text style={[text.monoSm, { color: t.textMuted, marginTop: 4 }]}>
            {counts.downloading} ACTIVE · {counts.history} DONE · {counts.blocked} BLOCKED
          </Text>
        </View>
        <AggregateSpeedStrip downloads={rows} tick={q.dataUpdatedAt} />
        <SplitView
          testID="activity-split"
          leftFlex={2}
          rightFlex={1}
          left={
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={[text.monoSm, { color: t.textMuted, padding: 14 }]}>
                DOWNLOADING · {queue.length}
              </Text>
              {queue.map((d) => (
                <SwipeToDelete
                  key={d.id}
                  testID={`swipe-delete-${d.id}`}
                  label="Cancel"
                  onDelete={() => gatedDelete(d.qbtHash)}
                >
                  <QueueRow download={d} />
                </SwipeToDelete>
              ))}
            </ScrollView>
          }
          right={
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 16,
                  paddingHorizontal: 14,
                  paddingTop: 14,
                  paddingBottom: 8,
                }}
              >
                {(['history', 'blocked'] as const).map((seg) => {
                  const active = tabletRight === seg;
                  const n = seg === 'history' ? history.length : blocked.length;
                  return (
                    <Pressable
                      key={seg}
                      testID={`tablet-seg-${seg}`}
                      onPress={() => setTabletRight(seg)}
                      style={{
                        paddingVertical: 4,
                        borderBottomWidth: 2,
                        borderBottomColor: active ? t.primary : TRANSPARENT,
                      }}
                    >
                      <Text
                        style={[
                          text.monoSm,
                          { color: active ? t.text : t.textMuted },
                        ]}
                      >
                        {seg === 'history' ? 'HISTORY' : 'BLOCKED'}
                        <Text style={[text.monoSm, { color: active ? t.primary : t.textMuted }]}>
                          {' '}
                          · {n}
                        </Text>
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {rightItems.length === 0 ? (
                <Text
                  testID={`tablet-${tabletRight}-empty`}
                  style={[text.bodySm, { color: t.textMuted, padding: 14 }]}
                >
                  {tabletRight === 'blocked' ? 'No blocked downloads.' : 'No history yet.'}
                </Text>
              ) : (
                rightItems.map((d) => (
                  <SwipeToDelete
                    key={d.id}
                    testID={`swipe-delete-${d.id}`}
                    label="Remove"
                    onDelete={() => gatedDelete(d.qbtHash)}
                  >
                    <HistoryRow download={d} />
                  </SwipeToDelete>
                ))
              )}
            </ScrollView>
          }
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer testID="screen-activity">
      <View style={{ paddingTop: 16, paddingBottom: 10 }}>
        <Text
          style={{
            fontFamily: fonts.display.semibold,
            fontSize: 28,
            letterSpacing: -0.7,
            color: t.text,
          }}
        >
          Activity
        </Text>
        <Text style={[text.monoSm, { color: t.textMuted, marginTop: 4 }]}>
          {counts.downloading} ACTIVE · {counts.history} DONE · {counts.blocked} BLOCKED
        </Text>
      </View>
      <AggregateSpeedStrip downloads={rows} tick={q.dataUpdatedAt} />
      <ActivityTabs active={tab} onChange={setTab} counts={counts} />
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {!online && !q.data ? (
          offlineCard
        ) : q.isLoading ? (
          <Text
            testID="activity-loading"
            style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}
          >
            Loading…
          </Text>
        ) : visible.length === 0 ? (
          <View style={{ padding: 24 }}>
            <EmptyState
              variant="ok"
              icon={CheckCircle2}
              title="All caught up"
              body="No pending grabs, no missing volumes, no failures."
            />
          </View>
        ) : (
          visible.map((d) => (
            <SwipeToDelete
              key={d.id}
              testID={`swipe-delete-${d.id}`}
              label={tab === 'downloading' ? 'Cancel' : 'Remove'}
              onDelete={() => gatedDelete(d.qbtHash)}
            >
              {tab === 'downloading' ? <QueueRow download={d} /> : <HistoryRow download={d} />}
            </SwipeToDelete>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
