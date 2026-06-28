import { View, Text, Pressable } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { ContentTypePill } from '@/components/Pill';
import { Button } from '@/components/Button';
import type { SearchResult } from '@/api/schemas';

interface Props {
  result: SearchResult;
  onAdd: () => void;
  onOpenInLibrary?: () => void;
  busy?: boolean;
  /**
   * Offline disable: dims the Add button and reports it as disabled to
   * accessibility, but (unlike `busy`) still lets the press fire so the
   * gated `onAdd` can toast "Unavailable offline". `busy` blocks the press.
   */
  disabled?: boolean;
}

export function SearchResultRow({ result, onAdd, onOpenInLibrary, busy, disabled }: Props) {
  const t = useTokens();
  return (
    <View
      testID={`search-result-${result.sourceId}`}
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      <View
        style={{
          width: 48,
          height: 66,
          borderRadius: 4,
          backgroundColor: t.surfaceMuted,
          borderWidth: 1,
          borderColor: t.border,
        }}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <ContentTypePill type={result.contentType} />
          {result.inLibrary ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: t.surfaceMuted,
              }}
            >
              <Text style={[text.monoSm, { color: t.textMuted }]}>IN LIBRARY</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={[text.label, { color: t.text }]}>
          {result.title}
        </Text>
        <Text numberOfLines={1} style={[text.monoSm, { color: t.textMuted }]}>
          {(result.author ?? 'unknown').toUpperCase()}
          {result.year ? ` · ${result.year}` : ''}
        </Text>
      </View>
      {result.inLibrary ? (
        <Pressable testID={`btn-open-${result.sourceId}`} onPress={onOpenInLibrary} hitSlop={8}>
          <ChevronRight size={16} color={t.textMuted} strokeWidth={1.75} />
        </Pressable>
      ) : (
        <Button
          testID={`btn-add-${result.sourceId}`}
          label={busy ? '…' : 'Add'}
          onPress={onAdd}
          // `busy` truly blocks the press (in-flight add). The offline `disabled`
          // must NOT block the press — the press still fires so the gated `onAdd`
          // can toast "Unavailable offline" — but the control must read as disabled
          // to accessibility and be dimmed. Passing `disabled={undefined}` (not
          // `false`) keeps Pressable from forcing `accessibilityState.disabled`,
          // letting the explicit `accessibilityState` below govern it.
          disabled={busy || undefined}
          accessibilityState={{ disabled: !!busy || !!disabled }}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            opacity: disabled ? 0.45 : undefined,
          }}
        />
      )}
    </View>
  );
}
