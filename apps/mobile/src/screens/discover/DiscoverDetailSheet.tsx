/**
 * DiscoverDetailSheet — mobile parity with the web DiscoverDetailDialog.
 *
 * Phone: slides up as a bottom sheet inside a transparent Modal.
 * Tablet: presented as a centered, width-capped (~560px) modal panel.
 *
 * Content mirrors the web dialog:
 *   cover · title · content-type Pill · in-library badge
 *   mono facts line (author · year · N volumes · M chapters)
 *   detail string · external links · truncated source IDs
 *   SYNOPSIS section (fetched from /api/discover/detail, 5-min cache)
 *   Quality-profile picker (defaults to the server-flagged default profile)
 *   Footer: Close + Add to library / In library indicator
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Check, ChevronDown, X } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { useLayout } from '@/responsive/useLayout';
import { Cover } from '@/components/Cover';
import { Pill } from '@/components/Pill';
import { Button } from '@/components/Button';
import { useAddSeries } from '@/api/hooks/useAddSeries';
import { useDiscoverDetail } from '@/api/hooks/useDiscoverDetail';
import { useQualityProfiles, defaultProfileId } from '@/api/hooks/useQualityProfiles';
import type { QualityProfile } from '@/api/hooks/useQualityProfiles';
import { buildAddBody } from '@/api/add-body';
import type { DiscoverResultItem } from '@/api/hooks/useDiscoverSearch';
import { DLABEL } from './fixtures';
import type { ContentType } from '@/api/schemas';

// ---------------------------------------------------------------------------
// External link helpers — mirrors web DiscoverDetailDialog's sourceLinks()
// ---------------------------------------------------------------------------

function anilistMangaUrl(id: number): string {
  return `https://anilist.co/manga/${id}`;
}
function mangadexMangaUrl(id: string): string {
  return `https://mangadex.org/title/${id}`;
}

type SourceLink = { label: string; href: string };

function buildSourceLinks(
  sources: DiscoverResultItem['sources'],
  lazilResolvedMdex?: string | null,
): SourceLink[] {
  const effective = lazilResolvedMdex != null && sources?.mangadex == null
    ? { ...sources, mangadex: lazilResolvedMdex }
    : sources;
  const links: SourceLink[] = [];
  if (effective?.anilist != null) links.push({ label: 'AniList', href: anilistMangaUrl(effective.anilist) });
  if (effective?.mangadex != null) links.push({ label: 'MangaDex', href: mangadexMangaUrl(effective.mangadex) });
  if (effective?.openlibrary != null) links.push({ label: 'OpenLibrary', href: `https://openlibrary.org/works/${effective.openlibrary}` });
  if (effective?.mal != null) links.push({ label: 'MyAnimeList', href: `https://myanimelist.net/manga/${effective.mal}` });
  return links;
}

function truncate(v: string): string {
  return v.length > 10 ? `${v.slice(0, 6)}…` : v;
}

function buildSourceIds(
  sources: DiscoverResultItem['sources'],
  lazilResolvedMdex?: string | null,
): string {
  const effective = lazilResolvedMdex != null && sources?.mangadex == null
    ? { ...sources, mangadex: lazilResolvedMdex }
    : sources;
  const parts: string[] = [];
  if (effective?.anilist != null) parts.push(`anilist:${effective.anilist}`);
  if (effective?.mal != null) parts.push(`mal:${effective.mal}`);
  if (effective?.mangadex != null) parts.push(`mdex:${truncate(effective.mangadex)}`);
  if (effective?.comicvine != null) parts.push(`comicvine:${effective.comicvine}`);
  if (effective?.openlibrary != null) parts.push(`olid:${truncate(effective.openlibrary)}`);
  if (effective?.audnex != null) parts.push(`asin:${truncate(effective.audnex)}`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// HUE lookup (mirrors DiscoverHome)
// ---------------------------------------------------------------------------
const HUE: Record<ContentType, number> = {
  manga: 12,
  novel: 220,
  comic: 45,
  ebook: 160,
  audio: 290,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  result: DiscoverResultItem | null;
  open: boolean;
  onClose: () => void;
  /** Called after a successful quick-add so DiscoverHome can flip the optimistic
   *  "added" set without re-querying. */
  onAdded?: (sourceId: string) => void;
}

// ---------------------------------------------------------------------------
// Sheet body (shared between phone bottom-sheet and tablet modal)
// ---------------------------------------------------------------------------

function ProfilePicker({
  profiles,
  selectedId,
  onSelect,
}: {
  profiles: QualityProfile[];
  selectedId: number | undefined;
  onSelect: (id: number) => void;
}) {
  const t = useTokens();
  const [open, setOpen] = useState(false);
  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0];

  if (profiles.length <= 1) {
    // Single profile: show as read-only label, no picker needed.
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 6,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.mono.medium,
            fontSize: 9,
            letterSpacing: 1.1,
            color: t.textMuted,
            textTransform: 'uppercase',
          }}
        >
          Quality profile:
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 9.5,
            color: t.text,
          }}
        >
          {selected?.name ?? '—'}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingVertical: 6 }}>
      <Pressable
        testID="discover-profile-picker"
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: fonts.mono.medium,
            fontSize: 9,
            letterSpacing: 1.1,
            color: t.textMuted,
            textTransform: 'uppercase',
          }}
        >
          Quality profile:
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 9.5,
            color: t.primary,
          }}
        >
          {selected?.name ?? '—'}
        </Text>
        <ChevronDown size={11} color={t.primary} strokeWidth={2} />
      </Pressable>
      {open ? (
        <View
          style={{
            marginTop: 6,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.surface,
            overflow: 'hidden',
          }}
        >
          {profiles.map((p) => (
            <Pressable
              key={p.id}
              testID={`profile-option-${p.id}`}
              onPress={() => {
                onSelect(p.id);
                setOpen(false);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: pressed ? t.surfaceMuted : 'transparent',
                gap: 8,
              })}
            >
              {p.id === selectedId ? (
                <Check size={12} color={t.primary} strokeWidth={2.4} />
              ) : (
                <View style={{ width: 12 }} />
              )}
              <Text
                style={{
                  fontFamily: fonts.sans.regular,
                  fontSize: 13.5,
                  color: t.text,
                }}
              >
                {p.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SheetBody({
  result,
  onClose,
  onAdded,
  isTablet,
}: {
  result: DiscoverResultItem;
  onClose: () => void;
  onAdded?: (sourceId: string) => void;
  isTablet: boolean;
}) {
  const t = useTokens();

  const add = useAddSeries();
  const detailQuery = useDiscoverDetail(result, true);
  const detail = detailQuery.data;
  const profilesQuery = useQualityProfiles();
  const profiles = profilesQuery.data ?? [];
  const [selectedProfileId, setSelectedProfileId] = useState<number | undefined>(undefined);

  // Sync selectedProfileId when profiles load (or change).
  useEffect(() => {
    if (profiles.length > 0 && selectedProfileId === undefined) {
      setSelectedProfileId(defaultProfileId(profiles));
    }
  }, [profiles, selectedProfileId]);

  // Merge lazily-resolved MangaDex id from the detail endpoint.
  const lazilResolvedMdex = detail?.mangadexId ?? null;

  const links = useMemo(
    () => buildSourceLinks(result.sources, lazilResolvedMdex),
    [result.sources, lazilResolvedMdex],
  );
  const ids = useMemo(
    () => buildSourceIds(result.sources, lazilResolvedMdex),
    [result.sources, lazilResolvedMdex],
  );

  // Strip HTML tags from AniList/web descriptions.
  const description = detail?.description
    ? detail.description.replace(/<[^>]*>/g, '').trim()
    : null;

  const facts: string[] = [];
  if (result.author) facts.push(result.author);
  if (result.year != null) facts.push(String(result.year));
  if (detail?.totalVolumes != null) facts.push(`${detail.totalVolumes} volumes`);
  if (detail?.totalChapters != null) facts.push(`${detail.totalChapters} chapters`);

  const inLib = result.inLib;
  const isAdding = add.isPending;
  const profilesLoading = profilesQuery.isLoading;
  const effectiveProfileId = selectedProfileId ?? defaultProfileId(profiles);
  const canAdd = !inLib && !isAdding && effectiveProfileId !== undefined && !profilesLoading;

  function handleAdd() {
    if (effectiveProfileId === undefined) return;
    add.mutate(
      buildAddBody(
        {
          contentType: result.contentType,
          sourceId: result.sourceId,
          title: result.title,
          author: result.author,
          year: result.year,
          isbn: result.isbn,
          coverUrl: result.coverUrl,
        },
        effectiveProfileId,
      ),
      {
        onSuccess: () => {
          onAdded?.(result.sourceId);
          onClose();
        },
        onError: (err: unknown) => {
          Alert.alert(
            "Couldn't add",
            err instanceof Error ? err.message : 'Please try again.',
          );
        },
      },
    );
  }

  const coverUri = result.coverUrl
    ?? (result.isbn ? `https://covers.openlibrary.org/b/isbn/${result.isbn}-M.jpg?default=false` : null);

  return (
    <View style={{ flex: 1 }}>
      {/* Header: drag handle (phone only) + cover + metadata */}
      {!isTablet ? (
        <View
          style={{
            alignSelf: 'center',
            width: 36,
            height: 4,
            borderRadius: 999,
            backgroundColor: t.border,
            marginTop: 10,
            marginBottom: 14,
          }}
        />
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover + right-side metadata */}
        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 14 }}>
          {/* Cover: 2/3 aspect ratio, fixed width */}
          <View style={{ width: 108, aspectRatio: 2 / 3 }}>
            <Cover
              uri={coverUri}
              hue={HUE[result.contentType] ?? 12}
              title={result.title}
              ratio={2 / 3}
            />
          </View>

          {/* Right column */}
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            {/* Title */}
            <Text
              style={{
                fontFamily: fonts.display.semibold,
                fontSize: 17,
                letterSpacing: -0.34,
                color: t.text,
                lineHeight: 22,
              }}
            >
              {result.title}
            </Text>

            {/* Content-type Pill + in-library badge */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <Pill kind={result.contentType} size="sm">
                {DLABEL[result.contentType]}
              </Pill>
              {inLib ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    height: 19,
                    paddingHorizontal: 7,
                    borderRadius: 999,
                    backgroundColor: t.surfaceMuted,
                    borderWidth: 1,
                    borderColor: t.border,
                  }}
                >
                  <Check size={10} color={t.ok} strokeWidth={2.4} />
                  <Text
                    style={{
                      fontFamily: fonts.mono.regular,
                      fontSize: 9.5,
                      letterSpacing: 0.9,
                      color: t.textMuted,
                      textTransform: 'uppercase',
                    }}
                  >
                    In library
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Mono facts line */}
            {facts.length > 0 ? (
              <Text
                numberOfLines={2}
                style={{
                  fontFamily: fonts.mono.regular,
                  fontSize: 10.5,
                  color: t.textMuted,
                  lineHeight: 15,
                }}
              >
                {facts.join(' · ')}
              </Text>
            ) : null}

            {/* Detail string (source-specific eyebrow) */}
            {result.detail ? (
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: fonts.mono.regular,
                  fontSize: 9.5,
                  letterSpacing: 0.38,
                  color: withAlpha(t.textMuted, 0.7),
                  textTransform: 'uppercase',
                }}
              >
                {result.detail}
              </Text>
            ) : null}

            {/* External links */}
            {links.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {links.map((l) => (
                  <Pressable
                    key={l.label}
                    onPress={() => void Linking.openURL(l.href)}
                    hitSlop={6}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.sans.medium,
                        fontSize: 12.5,
                        color: t.primary,
                      }}
                    >
                      {l.label} ↗
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Source IDs (mono, truncated) */}
            {ids ? (
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: fonts.mono.regular,
                  fontSize: 9,
                  color: withAlpha(t.textMuted, 0.6),
                }}
              >
                {ids}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Synopsis section */}
        {description ? (
          <View style={{ marginTop: 4 }}>
            {/* Eyebrow label */}
            <Text
              style={{
                fontFamily: fonts.mono.medium,
                fontSize: 9,
                letterSpacing: 1.26,
                color: t.textMuted,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Synopsis
            </Text>
            <Text
              style={{
                fontFamily: fonts.sans.regular,
                fontSize: 13,
                color: withAlpha(t.text, 0.9),
                lineHeight: 19,
              }}
            >
              {description}
            </Text>
          </View>
        ) : detailQuery.isLoading ? (
          /* Loading skeleton — three pulsing lines */
          <View style={{ marginTop: 4, gap: 8 }}>
            {[0.75, 1, 0.83].map((w, i) => (
              <View
                key={i}
                style={{
                  height: 11,
                  borderRadius: 6,
                  backgroundColor: t.surfaceMuted,
                  // No animation here (Reanimated gotcha: no string layout in
                  // useAnimatedStyle). Keep it static — the loading flash from a
                  // fast server will be imperceptible; a slow server shows the bar.
                  opacity: 0.6,
                  width: `${Math.round(w * 100)}%`,
                }}
              />
            ))}
          </View>
        ) : null}

        {/* Quality-profile picker (only shown when not in library) */}
        {!inLib && profiles.length > 0 ? (
          <View style={{ marginTop: 8 }}>
            <ProfilePicker
              profiles={profiles}
              selectedId={effectiveProfileId}
              onSelect={setSelectedProfileId}
            />
          </View>
        ) : null}

        {/* Bottom spacer so last content clears the footer */}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Footer */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 10,
          borderTopWidth: 1,
          borderColor: t.border,
          paddingHorizontal: 18,
          paddingVertical: 12,
        }}
      >
        <Pressable
          testID="discover-detail-close"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={6}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text
            style={{
              fontFamily: fonts.sans.medium,
              fontSize: 14,
              color: t.textMuted,
            }}
          >
            Close
          </Text>
        </Pressable>

        {inLib ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Check size={14} color={t.ok} strokeWidth={2.4} />
            <Text
              style={{
                fontFamily: fonts.sans.medium,
                fontSize: 13,
                color: t.textMuted,
              }}
            >
              In library
            </Text>
          </View>
        ) : (
          <Button
            testID="discover-detail-add"
            label={isAdding ? 'Adding…' : profilesLoading ? 'Loading…' : 'Add to library'}
            disabled={!canAdd}
            onPress={handleAdd}
            style={{ paddingVertical: 0, height: 40, paddingHorizontal: 18, borderRadius: 10 }}
          />
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function DiscoverDetailSheet({ result, open, onClose, onAdded }: Props) {
  const t = useTokens();
  const layout = useLayout();

  // Reset add-mutation state when the sheet closes.
  useEffect(() => {
    if (!open) {
      // Nothing to reset — the mutation state lives in the hook; closing the
      // sheet unmounts SheetBody which owns the mutation instance.
    }
  }, [open]);

  if (!open || result == null) return null;

  if (layout.isTablet) {
    // Tablet: centered modal panel capped at 560px wide.
    return (
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        {/* Full-screen scrim */}
        <Pressable
          style={{
            flex: 1,
            backgroundColor: t.scrim,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
          }}
          onPress={onClose}
          accessibilityLabel="Dismiss"
        >
          {/* Inner panel — stopPropagation so taps on the content don't dismiss */}
          <Pressable
            testID="discover-detail-sheet"
            style={{
              width: '100%',
              maxWidth: 560,
              maxHeight: '88%',
              backgroundColor: t.surface,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: t.border,
              overflow: 'hidden',
            }}
          >
            {/* Tablet header: title row with close button */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 18,
                paddingTop: 16,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderColor: t.border,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: fonts.display.semibold,
                  fontSize: 16,
                  letterSpacing: -0.32,
                  color: t.text,
                }}
                numberOfLines={1}
              >
                {result.title}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityLabel="Close"
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <X size={18} color={t.textMuted} strokeWidth={1.75} />
              </Pressable>
            </View>
            <SheetBody
              result={result}
              onClose={onClose}
              {...(onAdded !== undefined ? { onAdded } : {})}
              isTablet
            />
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // Phone: bottom sheet (slide-up modal, ManualGrabSheet / CreateGroupSheet pattern).
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Scrim */}
        <Pressable
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: t.scrim,
          }}
          accessibilityLabel="Dismiss"
          onPress={onClose}
        />
        {/* Sheet panel */}
        <View
          testID="discover-detail-sheet"
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderTopWidth: 1,
            borderColor: t.border,
            // Cap to 92% of the screen height so it never fully covers the screen.
            maxHeight: '92%',
          }}
        >
          <SheetBody
            result={result}
            onClose={onClose}
            {...(onAdded !== undefined ? { onAdded } : {})}
            isTablet={false}
          />
        </View>
      </View>
    </Modal>
  );
}
