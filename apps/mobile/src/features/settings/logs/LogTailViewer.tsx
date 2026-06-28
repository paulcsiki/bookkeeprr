import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { Button } from '@/components/Button';
import { Toggle } from '@/components/Toggle';
import { useLogTail, useLogPageFetcher } from '@/api/hooks';
import { LogLine, levelOf, LOG_LEVELS, type LogLevel } from './LogLine';

const TRANSPARENT = 'transparent';

interface Props {
  name: string;
}

export function LogTailViewer({ name }: Props) {
  const t = useTokens();
  const qc = useQueryClient();
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<LogLevel | null>(null);

  // The live tail: ALWAYS the newest page (before: null). Live polling and
  // Refresh act only on this query, so they keep following the tail no matter
  // how far back we have paged.
  const tail = useLogTail(name, { live });
  const fetchOlder = useLogPageFetcher(qc);

  // Older pages, accumulated separately so they never touch the tail's key.
  // Stored oldest-first so concatenation preserves server order. `cursor` is
  // the `before` value that produced each page (used to dedup).
  const [olderPages, setOlderPages] = useState<Array<{ cursor: number; lines: string[] }>>([]);
  // The `before` cursor to fetch the NEXT (still older) page from. Initialised
  // from the tail's `nextBefore`, then advanced as we page back.
  const [oldestBefore, setOldestBefore] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Reset all paging state when switching files.
  useEffect(() => {
    setOlderPages([]);
    setOldestBefore(null);
    setLoadingOlder(false);
    setFilter(null);
  }, [name]);

  const olderLines = useMemo(() => olderPages.flatMap((p) => p.lines), [olderPages]);

  const tailLines = useMemo(() => tail.data?.lines ?? [], [tail.data]);

  const allLines = useMemo(() => [...olderLines, ...tailLines], [olderLines, tailLines]);

  const visible = useMemo(
    () => (filter == null ? allLines : allLines.filter((l) => levelOf(l) === filter)),
    [allLines, filter],
  );

  // "Load earlier" is offered while there is a known older cursor. Before any
  // paging, that cursor is the tail's nextBefore; afterwards, the oldest page's
  // own nextBefore (tracked in `oldestBefore`).
  const tailHasMore = tail.data?.hasMore ?? false;
  const tailNextBefore = tail.data?.nextBefore ?? 0;
  const hasMore = oldestBefore != null ? oldestBefore > 0 : tailHasMore;

  async function loadEarlier() {
    if (loadingOlder) return;
    const cursor = oldestBefore ?? tailNextBefore;
    if (olderPages.some((p) => p.cursor === cursor)) return;
    setLoadingOlder(true);
    try {
      const page = await fetchOlder(name, cursor);
      setOlderPages((prev) =>
        prev.some((p) => p.cursor === cursor)
          ? prev
          : // Smaller cursor = older page → ascending keeps oldest first.
            [...prev, { cursor, lines: page.lines }].sort((a, b) => a.cursor - b.cursor),
      );
      // Advance the cursor: more pages remain only if the server says so.
      setOldestBefore(page.hasMore ? page.nextBefore : 0);
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <View testID="log-viewer" style={{ flex: 1 }}>
      {/* Controls */}
      <View style={{ gap: 10, paddingBottom: 10 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[text.label, { color: t.textMuted }]}>Live</Text>
            <Toggle testID="log-live-toggle" on={live} onChange={setLive} />
          </View>
          <Pressable
            testID="log-refresh"
            onPress={() => tail.refetch()}
            hitSlop={8}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: t.border,
            }}
          >
            <Text style={[text.label, { color: t.text }]}>Refresh</Text>
          </Pressable>
        </View>
        {/* Level filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {LOG_LEVELS.map((lvl) => {
            const active = filter === lvl;
            return (
              <Pressable
                key={lvl}
                testID={`log-level-${lvl}`}
                onPress={() => setFilter((cur) => (cur === lvl ? null : lvl))}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: active ? t.primary : TRANSPARENT,
                  borderWidth: 1,
                  borderColor: active ? t.primary : t.border,
                }}
              >
                <Text style={[text.monoSm, { color: active ? t.primaryFg : t.text }]}>{lvl}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {hasMore ? (
          <Button
            testID="log-load-earlier"
            label="Load earlier"
            variant="secondary"
            onPress={loadEarlier}
            style={{ marginBottom: 8 }}
          />
        ) : null}
        {tail.isLoading && allLines.length === 0 ? (
          <Text style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}>
            Loading…
          </Text>
        ) : visible.length === 0 ? (
          <Text style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}>
            No matching log lines.
          </Text>
        ) : (
          visible.map((line, i) => <LogLine key={`${i}-${line.slice(0, 24)}`} line={line} />)
        )}
      </ScrollView>
    </View>
  );
}
