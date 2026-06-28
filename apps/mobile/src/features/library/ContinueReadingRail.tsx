import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import FastImage from 'react-native-fast-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { ContentTypePill } from '@/components/Pill';
import { Download, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react-native';
import { Spinner } from '@/components/Spinner';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { useAuth } from '@/auth/AuthContext';
import { resolveAssetUri } from '@/api/asset';
import { useContinueReading } from '@/api/hooks/useContinueReading';
import { useResetReadingProgress } from '@/api/hooks/useResetReadingProgress';
import { downloadReadable, useReaderDownloads } from '@/state/readerDownloadsStore';
import { useOnlineGate } from '@/features/system/online';
import { offlineReaderParams } from '@/features/system/offlineContent';
import type { ContentType, ReaderContentType, ContinueReadingItem } from '@/api/schemas';
import type { LibraryStackParamList } from '@/navigation/types';

/**
 * Map the server (DB) content-type enum onto the mobile `ContentType` the
 * `ContentTypePill` understands. The server reports `light_novel`/`audiobook`;
 * the pill expects `novel`/`audio`. Everything else passes through 1:1.
 */
function toPillType(c: ReaderContentType): ContentType {
  switch (c) {
    case 'light_novel':
      return 'novel';
    case 'audiobook':
      return 'audio';
    default:
      return c;
  }
}

/**
 * Horizontal "Continue Reading" rail of the user's most-recently-touched
 * readables (newest first), backed by `useContinueReading()`. Each card shows
 * the series cover, a content-type pill, the title, and a progress bar with a
 * mono percentage (or a FINISHED state). Tapping opens the `Reader` route.
 */
export function ContinueReadingRail() {
  const t = useTokens();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const { state } = useAuth();
  const token = state.status === 'authenticated' ? state.creds.token : '';
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  const { data, refetch } = useContinueReading();
  const downloads = useReaderDownloads((s) => s.downloads);
  const reset = useResetReadingProgress();
  const { gate } = useOnlineGate();
  // The card a long-press opened the "remove" confirmation sheet for, if any.
  const [confirming, setConfirming] = useState<ContinueReadingItem | null>(null);

  // Refetch whenever this screen regains focus — e.g. returning from the reader.
  // React Native has no window-focus refetch, so without this the rail keeps
  // showing the pre-reading list and a just-finished book lingers here.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Drop fully-read books: once finished (or at the very end), a title should
  // leave "Continue Reading" rather than linger with a FINISHED badge. Mirrors
  // the web dashboard's continue-reading filter.
  const items = (data?.items ?? []).filter((i) => !i.finished && i.position < 0.999);
  if (items.length === 0) return null;

  return (
    <View testID="continue-reading-rail" style={{ marginBottom: 16 }}>
      <Text style={[text.monoSm, { color: t.textMuted, paddingHorizontal: 18, paddingBottom: 8 }]}>
        CONTINUE READING
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 18 }}
      >
        {items.slice(0, 6).map((item) => {
          const pct = Math.round(Math.min(Math.max(item.position, 0), 1) * 100);
          const dl = downloads[item.readableKey];
          const dlState = dl?.state;
          const dlPct = dl?.pct ?? 0;
          // coverUrl may be a root-relative /api/img proxy path (volume covers);
          // resolve it against the server so the device can load it.
          const coverUri = resolveAssetUri(serverUrl, item.coverUrl);
          const triggerDownload = (): void =>
            void downloadReadable(item.readableKey, {
              title: item.title ?? '',
              contentType: toPillType(item.contentType),
              coverUrl: coverUri,
              serverUrl,
              token,
            });
          return (
            <Pressable
              key={item.id}
              testID={`continue-card-${item.id}`}
              onPress={() => navigation.navigate('Reader', offlineReaderParams(item.readableKey))}
              onLongPress={() => setConfirming(item)}
              delayLongPress={350}
              style={{ width: 144 }}
            >
              <View
                style={{
                  aspectRatio: 2 / 3,
                  borderRadius: 8,
                  backgroundColor: t.surfaceMuted,
                  borderWidth: 1,
                  borderColor: t.border,
                  overflow: 'hidden',
                }}
              >
                {coverUri ? (
                  <FastImage
                    source={{
                      uri: coverUri,
                      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
                    }}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  />
                ) : null}
                <View style={{ position: 'absolute', top: 8, left: 8 }}>
                  <ContentTypePill type={toPillType(item.contentType)} />
                </View>
                {dlState === 'done' ? (
                  <View
                    testID={`continue-offline-${item.id}`}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: t.bg,
                    }}
                  >
                    <CheckCircle2 size={13} color={t.ok} strokeWidth={2.2} />
                  </View>
                ) : dlState === 'downloading' || dlState === 'queued' ? (
                  <View
                    testID={`continue-downloading-${item.id}`}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 4,
                      backgroundColor: t.bg,
                    }}
                  >
                    <Spinner size="sm" color={t.primary} />
                    <Text style={[text.label, { color: t.primary }]}>
                      {dlState === 'queued' ? '…' : `${dlPct}%`}
                    </Text>
                  </View>
                ) : dlState === 'error' ? (
                  <Pressable
                    testID={`continue-download-retry-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="Retry download"
                    hitSlop={8}
                    onPress={gate(triggerDownload)}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      padding: 5,
                      borderRadius: 4,
                      backgroundColor: t.bg,
                    }}
                  >
                    <AlertCircle size={14} color={t.err} strokeWidth={2} />
                  </Pressable>
                ) : (
                  <Pressable
                    testID={`continue-download-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="Download for offline"
                    hitSlop={8}
                    onPress={gate(triggerDownload)}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      padding: 5,
                      borderRadius: 4,
                      backgroundColor: t.bg,
                    }}
                  >
                    <Download size={14} color={t.text} strokeWidth={1.75} />
                  </Pressable>
                )}
              </View>
              <Text numberOfLines={1} style={[text.label, { color: t.text, marginTop: 6 }]}>
                {item.title ?? '—'}
              </Text>
              {item.finished ? (
                <Text style={[text.mono, { color: t.ok, marginTop: 4 }]}>FINISHED</Text>
              ) : (
                <View style={{ marginTop: 6 }}>
                  <View
                    style={{
                      height: 3,
                      borderRadius: 2,
                      backgroundColor: t.surfaceMuted,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        height: 3,
                        width: `${pct}%`,
                        backgroundColor: t.primary,
                      }}
                    />
                  </View>
                  <Text style={[text.mono, { color: t.textMuted, marginTop: 4 }]}>{pct}%</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {confirming ? (
        // Screen-level host (CustomizeSheet pattern): the rail renders inside
        // the dashboard ScrollView's content, so a plain-sibling BottomSheet
        // would lay out as a squashed inline card at the rail's position
        // instead of sliding over the screen. A transparent Modal always
        // overlays the full window.
        <Modal visible transparent animationType="slide" onRequestClose={() => setConfirming(null)}>
          <BottomSheet testID="continue-remove-sheet" onDismiss={() => setConfirming(null)}>
          <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 14 }}>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: t.surfaceMuted,
                }}
              >
                <Trash2 size={20} color={t.err} strokeWidth={2} />
              </View>
              <Text style={[text.displaySm, { color: t.text, textAlign: 'center' }]}>
                Remove from Continue Reading?
              </Text>
              <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center' }]}>
                This drops “{confirming.title ?? 'this title'}” from Continue Reading and resets
                your reading progress for that volume. You can start it again any time.
              </Text>
            </View>
            <View style={{ gap: 10, marginTop: 6 }}>
              <Pressable
                testID="continue-remove-confirm"
                accessibilityRole="button"
                disabled={reset.isPending}
                onPress={() =>
                  reset.mutate(confirming.readableKey, { onSettled: () => setConfirming(null) })
                }
                style={{
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: t.err,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: reset.isPending ? 0.6 : 1,
                }}
              >
                {reset.isPending ? (
                  <Spinner size="sm" color={t.primaryFg} />
                ) : (
                  <Trash2 size={16} color={t.primaryFg} strokeWidth={2} />
                )}
                <Text style={[text.label, { fontSize: 14.5, color: t.primaryFg }]}>
                  Remove & reset progress
                </Text>
              </Pressable>
              <Button
                testID="continue-remove-cancel"
                label="Cancel"
                variant="ghost"
                onPress={() => setConfirming(null)}
              />
            </View>
          </View>
          </BottomSheet>
        </Modal>
      ) : null}
    </View>
  );
}
