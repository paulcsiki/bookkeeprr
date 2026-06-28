import { View, Text, Pressable } from 'react-native';
import { History } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { EmptyState } from '@/components/EmptyState';
import { useMatcherReplays } from '@/api/hooks';
import type { ReplayRun } from '@/api/schemas';
import { ReplayStatusBadge } from './ReplayStatusBadge';
import { relativeTime, windowLabel } from './format';

interface Props {
  onOpenRun: (run: ReplayRun) => void;
}

function RunRow({ run, last, onPress }: { run: ReplayRun; last: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      testID={`replay-run-${run.id}`}
      onPress={onPress}
      style={{
        padding: 14,
        gap: 8,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[text.mono, { flex: 1, color: t.text }]}>
          Run #{run.id} — {windowLabel(run)}
        </Text>
        <Text style={[text.monoSm, { color: t.textMuted }]}>{relativeTime(run.triggeredAt)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ReplayStatusBadge status={run.status} />
        <Text style={[text.monoSm, { color: t.textMuted, flexShrink: 1 }]}>
          {run.releasesTotal} evaluated · {run.releasesFlipped} flipped · {run.releasesRescored}{' '}
          rescored
        </Text>
      </View>
      {run.errorMessage ? (
        <Text style={[text.monoSm, { color: t.errFg }]} numberOfLines={2}>
          {run.errorMessage}
        </Text>
      ) : null}
    </Pressable>
  );
}

// Recent replay runs under the matcher forms; tapping a run opens its detail
// sheet (per-release outcomes), mirroring web's /settings/matcher/replays.
export function ReplayHistorySection({ onOpenRun }: Props) {
  const t = useTokens();
  const q = useMatcherReplays();

  return (
    <View style={{ gap: 12 }}>
      <Text style={[text.displaySm, { color: t.text, marginTop: 22 }]}>Replay history</Text>
      {q.isLoading ? (
        <Text
          testID="replay-history-loading"
          style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}
        >
          Loading…
        </Text>
      ) : q.isError ? (
        <EmptyState
          variant="err"
          icon={History}
          title="Couldn't load replay history"
          body="The server didn't answer. Check the connection and try again."
          actionLabel="Retry"
          onAction={() => void q.refetch()}
        />
      ) : (q.data?.runs.length ?? 0) === 0 ? (
        <EmptyState
          variant="muted"
          icon={History}
          title="No replays yet"
          body="Replays run automatically when you save matcher settings, re-scoring past releases against the new weights."
        />
      ) : (
        <View
          testID="replay-history-list"
          style={{
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: 12,
            backgroundColor: t.surface,
            overflow: 'hidden',
          }}
        >
          {(q.data?.runs ?? []).map((run, i, all) => (
            <RunRow
              key={run.id}
              run={run}
              last={i === all.length - 1}
              onPress={() => onOpenRun(run)}
            />
          ))}
        </View>
      )}
    </View>
  );
}
