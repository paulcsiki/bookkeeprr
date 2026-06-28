import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { ArrowLeft, CloudOff, Link2, RefreshCw } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { EmptyState } from '@/components/EmptyState';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useInteractiveSearch, useSeries, useGrabRelease } from '@/api/hooks';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { ReleaseRow } from '@/features/interactive/ReleaseRow';
import { ManualGrabSheet } from '@/features/interactive/ManualGrabSheet';
import type { LibraryStackParamList } from '@/navigation/types';

export default function InteractiveSearch() {
  const route = useRoute<RouteProp<LibraryStackParamList, 'InteractiveSearch'>>();
  const seriesId = route.params.seriesId;
  const id = Number(seriesId);
  const t = useTokens();
  const navigation = useNavigation();
  const series = useSeries(id);
  const search = useInteractiveSearch(id);
  const grab = useGrabRelease();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();
  const [grabbingId, setGrabbingId] = useState<number | null>(null);
  const [magnetSheetOpen, setMagnetSheetOpen] = useState(false);
  const [magnetSent, setMagnetSent] = useState(false);

  const onGrab = async (releaseId: number) => {
    setGrabbingId(releaseId);
    try {
      await grab.mutateAsync(releaseId);
    } finally {
      setGrabbingId(null);
    }
  };

  return (
    <ScreenContainer testID="screen-interactive-search" edges={['top', 'bottom', 'left', 'right']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-interactive" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Interactive Search</Text>
        <Pressable testID="btn-refresh-interactive" onPress={gate(() => search.refetch())} hitSlop={8}>
          <RefreshCw size={20} color={t.text} strokeWidth={1.75} />
        </Pressable>
      </View>

      {series.data ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
          }}
        >
          <View
            style={{
              width: 40,
              height: 56,
              borderRadius: 4,
              backgroundColor: t.surfaceMuted,
              borderWidth: 1,
              borderColor: t.border,
            }}
          />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={[text.displaySm, { color: t.text }]}>{series.data.title}</Text>
            {search.data ? (
              <Text style={[text.monoSm, { color: t.textMuted, marginTop: 4 }]}>
                {search.data.releases.length} RELEASES · {search.data.indexerCount} INDEXERS ·{' '}
                {search.data.tookMs}MS
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {!online && !search.data ? (
          <View style={{ padding: 24 }}>
            <EmptyState
              variant="muted"
              icon={CloudOff}
              title="You're offline"
              body="Reconnect to search releases."
            />
          </View>
        ) : search.isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : search.isError ? (
          <Text
            testID="err-interactive"
            style={[text.bodySm, { color: t.err, paddingVertical: 24, textAlign: 'center' }]}
          >
            Couldn&apos;t load releases.
          </Text>
        ) : (
          <>
            {search.data?.releases.map((r) => (
              <ReleaseRow
                key={r.releaseId}
                release={r}
                onGrab={gate(() => onGrab(r.releaseId))}
                grabbing={grabbingId === r.releaseId}
                disabled={disabledProps.disabled}
              />
            ))}
            {search.data !== undefined && search.data.releases.length === 0 ? (
              <Text
                style={[
                  text.bodySm,
                  { color: t.textMuted, paddingVertical: 24, textAlign: 'center' },
                ]}
              >
                No releases found.
              </Text>
            ) : null}
          </>
        )}

        {/* Manual magnet grab — deliberately visible even (especially) when the
            indexers came back empty: that's exactly when the user reaches for
            their own magnet link. */}
        {!search.isLoading && (online || search.data) ? (
          <View style={{ gap: 10, paddingTop: 16 }}>
            {magnetSent ? (
              <Text style={[text.bodySm, { color: t.ok, textAlign: 'center' }]}>
                Magnet added. The download will show up in Activity.
              </Text>
            ) : (
              <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center' }]}>
                Not seeing the release you want?
              </Text>
            )}
            <Pressable
              testID="btn-manual-grab"
              accessibilityRole="button"
              onPress={gate(() => {
                setMagnetSent(false);
                setMagnetSheetOpen(true);
              })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 13,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: t.border,
                backgroundColor: t.surfaceMuted,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Link2 size={16} color={t.text} strokeWidth={1.75} />
              <Text style={[text.button, { color: t.text }]}>Add magnet link</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {magnetSheetOpen ? (
        <ManualGrabSheet
          seriesId={id}
          onClose={() => setMagnetSheetOpen(false)}
          onGrabbed={() => {
            setMagnetSheetOpen(false);
            setMagnetSent(true);
          }}
        />
      ) : null}
    </ScreenContainer>
  );
}
