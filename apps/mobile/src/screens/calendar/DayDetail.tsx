import { View, Text, Pressable } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { Cover } from '@/components/Cover';
import { ContentTypePill } from '@/components/Pill';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/auth/AuthContext';
import { resolveAssetUri } from '@/api/asset';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import type { CalendarEntry, ContentType } from '@/api/schemas';

// Empty-cover gradient hues per content type (same map the dashboard rails use).
const HUE: Record<ContentType, number> = { manga: 12, novel: 220, comic: 45, ebook: 160, audio: 290 };

interface Props {
  entries: CalendarEntry[];
  onPressRelease: (seriesId: number) => void;
}

/**
 * The releases of a single calendar day: cover thumb, series title + volume
 * number, author/publisher byline, and the content-type pill. Shared between
 * the pushed phone day screen and the tablet-landscape split right pane.
 * Tapping a row opens the series overview.
 */
export function DayDetail({ entries, onPressRelease }: Props) {
  const t = useTokens();
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';

  if (entries.length === 0) {
    return (
      <View style={{ paddingVertical: 24 }}>
        <EmptyState
          variant="muted"
          icon={CalendarDays}
          title="No releases"
          body="Nothing is scheduled for this day."
        />
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {entries.map((e) => {
        const byline = [e.author, e.publisher].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={e.volumeId}
            testID={`cal-release-${e.volumeId}`}
            accessibilityRole="button"
            accessibilityLabel={`${e.seriesTitle} volume ${e.volumeNumber}`}
            onPress={() => onPressRelease(e.seriesId)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: t.border,
              backgroundColor: t.surface,
            }}
          >
            <View style={{ width: 44 }}>
              <Cover
                uri={resolveAssetUri(serverUrl, e.coverUrl)}
                hue={HUE[e.contentType]}
                title={e.seriesTitle}
                size="sm"
              />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: fonts.display.semibold,
                  fontSize: 15,
                  letterSpacing: -0.22,
                  color: t.text,
                }}
              >
                {e.seriesTitle} <Text style={{ color: t.textMuted }}>· v{e.volumeNumber}</Text>
              </Text>
              {byline ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: fonts.mono.regular,
                    fontSize: 9.5,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    color: t.textMuted,
                  }}
                >
                  {byline}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ContentTypePill type={e.contentType} size="xs" />
                {e.volumeTitle ? (
                  <Text numberOfLines={1} style={[text.bodySm, { color: t.textMuted, flexShrink: 1 }]}>
                    {e.volumeTitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
