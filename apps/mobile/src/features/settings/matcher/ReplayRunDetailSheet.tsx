import { View, Text, ScrollView } from 'react-native';
import { History } from 'lucide-react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useMatcherReplayDetail } from '@/api/hooks';
import type { ReplayRun, ReplayDiffRow } from '@/api/schemas';
import { ReplayStatusBadge } from './ReplayStatusBadge';
import { relativeTime, windowLabel } from './format';

interface Props {
  run: ReplayRun;
  onDismiss: () => void;
}

function outcomeOf(row: ReplayDiffRow, t: ReturnType<typeof useTokens>) {
  // Web parity (ReplayDetail's RowItem): adopted wins, then flip direction,
  // then plain rescore.
  if (row.adoptedAt) return { label: 'adopted', color: t.ok };
  if (row.changedKind === 'flipped') {
    return row.newWouldGrab
      ? { label: 'now grabs', color: t.primary }
      : { label: 'no longer grabs', color: t.textMuted };
  }
  return { label: 'rescored', color: t.textMuted };
}

function DiffRow({ row, last }: { row: ReplayDiffRow; last: boolean }) {
  const t = useTokens();
  const outcome = outcomeOf(row, t);
  return (
    <View
      testID={`replay-detail-row-${row.id}`}
      style={{
        paddingVertical: 10,
        gap: 4,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.border,
      }}
    >
      <Text numberOfLines={1} style={[text.mono, { color: t.text }]}>
        {row.release?.title ?? `release #${row.releaseId}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={[text.monoSm, { flex: 1, color: t.textMuted }]}>
          {row.release?.seriesTitle ?? '—'}
        </Text>
        <Text style={[text.monoSm, { color: t.textMuted }]}>
          {row.oldScore ?? '—'} → {row.newScore ?? '—'}
        </Text>
        <Text style={[text.monoSm, { color: outcome.color }]}>{outcome.label}</Text>
      </View>
    </View>
  );
}

// Per-release outcomes for one replay run — the mobile counterpart of web's
// /settings/matcher/replays/[runId]. Read-only: adopting flipped decisions
// stays a web-only action for now.
export function ReplayRunDetailSheet({ run, onDismiss }: Props) {
  const t = useTokens();
  const q = useMatcherReplayDetail(run.id);
  const rows = q.data?.rows ?? [];

  return (
    <BottomSheet testID="replay-detail" onDismiss={onDismiss}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={[text.displaySm, { flex: 1, color: t.text }]}>Replay run #{run.id}</Text>
          <ReplayStatusBadge status={run.status} />
        </View>
        <Text style={[text.monoSm, { color: t.textMuted }]}>
          {windowLabel(run)} · {run.releasesTotal} evaluated · {run.releasesFlipped} flipped ·{' '}
          {run.releasesRescored} rescored
        </Text>
        <Text style={[text.bodySm, { color: t.textMuted }]}>
          Triggered {relativeTime(run.triggeredAt)}
          {run.completedAt ? `, completed ${relativeTime(run.completedAt)}` : ''}
        </Text>
        {run.errorMessage ? (
          <Text testID="replay-detail-error-message" style={[text.monoSm, { color: t.errFg }]}>
            {run.errorMessage}
          </Text>
        ) : null}
      </View>
      <ScrollView
        style={{ maxHeight: 420 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {q.isLoading ? (
          <Text
            testID="replay-detail-loading"
            style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}
          >
            Loading…
          </Text>
        ) : q.isError ? (
          <EmptyState
            variant="err"
            icon={History}
            title="Couldn't load this run"
            body="The server didn't answer. Check the connection and try again."
            actionLabel="Retry"
            onAction={() => void q.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            variant="muted"
            icon={History}
            title="No outcome changes"
            body="This replay didn't flip or re-score any release decisions."
          />
        ) : (
          rows.map((row, i, all) => <DiffRow key={row.id} row={row} last={i === all.length - 1} />)
        )}
      </ScrollView>
    </BottomSheet>
  );
}
