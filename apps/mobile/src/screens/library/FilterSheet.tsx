import type { ReactNode } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/BottomSheet';
import { Checkbox } from '@/components/Checkbox';
import { Radio } from '@/components/Radio';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { applyLibraryFilters } from '@/features/library/applyFilters';
import {
  useLibraryFilter,
  type LibraryHealth,
  type LibraryRead,
  type LibraryMon,
  type LibrarySort,
  type LibraryView,
} from '@/state/libraryFilterStore';
import { useLibrary } from '@/api/hooks';
import type { ContentType } from '@/api/schemas';

const TRANSPARENT = 'transparent';

const TYPES: Array<{ value: ContentType; label: string }> = [
  { value: 'manga', label: 'Manga' },
  { value: 'novel', label: 'Light Novel' },
  { value: 'comic', label: 'Comic' },
  { value: 'ebook', label: 'eBook' },
  { value: 'audio', label: 'Audiobook' },
];

const READS: Array<{ value: LibraryRead; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unfinished', label: 'Unfinished' },
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'In progress' },
  { value: 'finished', label: 'Finished' },
];

const MONS: Array<{ value: LibraryMon; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'monitored', label: 'Monitored' },
  { value: 'unmonitored', label: 'Unmonitored' },
];

const HEALTHS: Array<{ value: LibraryHealth; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'complete', label: 'Complete' },
  { value: 'missing', label: 'Missing' },
  { value: 'downloading', label: 'Downloading' },
  { value: 'error', label: 'Error' },
];

const SORTS: Array<{ value: LibrarySort; label: string }> = [
  { value: 'added_at:desc', label: 'Recently added' },
  { value: 'title:asc', label: 'Title A → Z' },
  { value: 'added_at:asc', label: 'Date added (oldest)' },
  { value: 'volumes:desc', label: 'Most volumes' },
  { value: 'progress:asc', label: 'Least progress' },
];

const VIEWS: Array<{ value: LibraryView; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
];

function SectionLabel({ children }: { children: ReactNode }) {
  const t = useTokens();
  return (
    <Text style={[text.monoSm, { color: t.textMuted, marginTop: 18, marginBottom: 10 }]}>
      {children}
    </Text>
  );
}

// Single-select segmented control. Wraps to as many rows as needed so 4–5
// options stay readable on phone width; on tablet the sheet is wider so they
// fit in one row. Active cell tints in the primary soft fill.
function Segmented<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  testIDPrefix: string;
}) {
  const t = useTokens();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        backgroundColor: t.bg,
        borderRadius: 10,
        padding: 4,
        borderWidth: 1,
        borderColor: t.border,
      }}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            testID={`${testIDPrefix}-${o.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              flexGrow: 1,
              flexBasis: '30%',
              paddingVertical: 8,
              paddingHorizontal: 6,
              borderRadius: 6,
              backgroundColor: active ? t.primary : TRANSPARENT,
              alignItems: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              style={[text.label, { color: active ? t.primaryFg : t.textMuted }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function FilterSheet() {
  const navigation = useNavigation();
  const t = useTokens();
  const filter = useLibraryFilter();
  const apiSort: 'added_at:desc' | 'added_at:asc' | 'title:asc' =
    filter.sort === 'volumes:desc' || filter.sort === 'progress:asc'
      ? 'added_at:desc'
      : filter.sort;
  const q = useLibrary({ page: 1, limit: 50, sort: apiSort });
  const allRows = q.data?.rows ?? [];
  const shownCount = q.data
    ? applyLibraryFilters(allRows, {
        contentTypes: filter.contentTypes,
        read: filter.read,
        mon: filter.mon,
        health: filter.health,
      }).length
    : undefined;
  const countLabel = typeof shownCount === 'number' ? `Show ${shownCount} series` : 'Apply';

  return (
    <View testID="screen-filter-sheet" style={{ flex: 1 }}>
      <BottomSheet testID="filter-sheet" onDismiss={() => navigation.goBack()}>
        <View style={{ paddingHorizontal: 20 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              paddingBottom: 10,
            }}
          >
            <Text style={[text.displayMd, { color: t.text }]}>Filter & Sort</Text>
            <Pressable testID="btn-filter-reset" onPress={filter.reset}>
              <Text style={[text.label, { color: t.primary }]}>Reset</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 540 }} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* View toggle — Grid / List */}
            <Text style={[text.monoSm, { color: t.textMuted, marginBottom: 10 }]}>VIEW</Text>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: t.bg,
                borderRadius: 10,
                padding: 4,
                borderWidth: 1,
                borderColor: t.border,
              }}
            >
              {VIEWS.map((v) => {
                const active = filter.view === v.value;
                return (
                  <Pressable
                    key={v.value}
                    testID={`filter-view-${v.value}`}
                    onPress={() => filter.setView(v.value)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 6,
                      backgroundColor: active ? t.primary : TRANSPARENT,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={[text.label, { color: active ? t.primaryFg : t.textMuted }]}>
                      {v.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <SectionLabel>CONTENT TYPE</SectionLabel>
            {TYPES.map((row) => {
              const count = allRows.filter((s) => s.contentType === row.value).length;
              // Exclusive: selecting a type clears the others; tapping the active
              // one returns to All ([]).
              const selectExclusive = (): void =>
                filter.setContentTypes(
                  filter.contentTypes.includes(row.value) ? [] : [row.value],
                );
              return (
                <Pressable
                  key={row.value}
                  testID={`filter-type-${row.value}`}
                  onPress={selectExclusive}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: t.border,
                  }}
                >
                  <Checkbox
                    checked={filter.contentTypes.includes(row.value)}
                    onChange={selectExclusive}
                    testID={`cb-${row.value}`}
                  />
                  <Text style={[text.label, { flex: 1, color: t.text }]}>{row.label}</Text>
                  <Text style={[text.monoSm, { color: t.textMuted }]}>{count}</Text>
                </Pressable>
              );
            })}

            <SectionLabel>READING</SectionLabel>
            <Segmented
              options={READS}
              value={filter.read}
              onChange={filter.setRead}
              testIDPrefix="filter-read"
            />

            <SectionLabel>MONITORING</SectionLabel>
            <Segmented
              options={MONS}
              value={filter.mon}
              onChange={filter.setMon}
              testIDPrefix="filter-mon"
            />

            <SectionLabel>HEALTH</SectionLabel>
            <Segmented
              options={HEALTHS}
              value={filter.health}
              onChange={filter.setHealth}
              testIDPrefix="filter-health"
            />

            <SectionLabel>SORT BY</SectionLabel>
            {SORTS.map((s) => (
              <Pressable
                key={s.value}
                testID={`filter-sort-${s.value}`}
                onPress={() => filter.setSort(s.value)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: t.border,
                }}
              >
                <Radio
                  checked={filter.sort === s.value}
                  onChange={() => filter.setSort(s.value)}
                  testID={`radio-${s.value}`}
                />
                <Text style={[text.label, { flex: 1, color: t.text }]}>{s.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Button
            testID="btn-filter-apply"
            label={countLabel}
            onPress={() => navigation.goBack()}
            style={{ marginTop: 8 }}
          />
        </View>
      </BottomSheet>
    </View>
  );
}
