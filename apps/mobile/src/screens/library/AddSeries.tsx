import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Folder, Search, SearchX, X } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { EmptyState } from '@/components/EmptyState';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useSearchSeries, useAddSeries, useLibraryGroups } from '@/api/hooks';
import { buildAddBody, type AddBodyInput } from '@/api/add-body';
import { SearchResultRow } from '@/features/add/SearchResultRow';
import { useOnlineGate } from '@/features/system/online';
import { GroupPickerSheet } from '@/features/library/groups/GroupPickerSheet';
import type { ContentType } from '@/api/schemas';
import type { LibraryStackParamList } from '@/navigation/types';

const TRANSPARENT = 'transparent';

const FILTERS: Array<{ label: string; value: ContentType | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Manga', value: 'manga' },
  { label: 'Novel', value: 'novel' },
  { label: 'Comic', value: 'comic' },
  { label: 'eBook', value: 'ebook' },
];

export default function AddSeries() {
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const t = useTokens();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ContentType | 'all'>('all');
  const [groupId, setGroupId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const search = useSearchSeries({ query, contentType: filter });
  const add = useAddSeries();
  const groupsQ = useLibraryGroups();
  const groups = groupsQ.data?.groups ?? [];
  const { gate, disabledProps } = useOnlineGate();

  // Reset groupId on unmount (screen leave).
  useEffect(() => {
    return () => {
      setGroupId(null);
    };
  }, []);

  const selectionName =
    groupId === null
      ? 'Library root'
      : (groups.find((g) => g.id === groupId)?.name ?? 'Library root');

  const onAdd = (item: AddBodyInput) => {
    add.mutate(buildAddBody(item, 1, groupId), {
      onSuccess: () => {
        // Reset group selection after a successful add.
        setGroupId(null);
      },
    });
  };

  return (
    <ScreenContainer testID="screen-add-search" edges={['top', 'bottom', 'left', 'right']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 10,
          gap: 10,
        }}
      >
        <Pressable testID="btn-close-add" onPress={() => navigation.goBack()} hitSlop={8}>
          <X size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Add to Library</Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: t.surface,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: search.isFetching ? t.primary : t.border,
        }}
      >
        <Search size={16} color={t.textMuted} strokeWidth={1.75} />
        <TextInput
          testID="input-add-search"
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search for a series"
          placeholderTextColor={t.textMuted}
          returnKeyType="search"
          style={{ flex: 1, color: t.text, fontFamily: 'Geist_400Regular', fontSize: 15 }}
        />
        {search.data ? (
          <Text style={[text.monoSm, { color: t.textMuted }]}>
            {search.data.results.length} · {search.data.tookMs}ms
          </Text>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          backgroundColor: t.surface,
          borderRadius: 10,
          padding: 4,
          marginTop: 12,
          borderWidth: 1,
          borderColor: t.border,
        }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Pressable
              key={f.value}
              testID={`filter-${f.value}`}
              onPress={() => setFilter(f.value)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 6,
                backgroundColor: active ? t.primary : TRANSPARENT,
                alignItems: 'center',
              }}
            >
              <Text style={[text.label, { color: active ? t.primaryFg : t.textMuted }]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Add into · <group selection> row */}
      <Pressable
        testID="add-into-row"
        onPress={() => setPickerOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginTop: 12,
          paddingHorizontal: 14,
          paddingVertical: 11,
          backgroundColor: t.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.border,
        }}
      >
        <Folder size={16} color={t.textMuted} strokeWidth={1.75} />
        <Text style={[text.label, { flex: 1, color: t.textMuted }]}>Add into</Text>
        <Text
          numberOfLines={1}
          style={[text.label, { color: t.text, flexShrink: 1 }]}
        >
          {selectionName}
        </Text>
        <ChevronRight size={14} color={t.textMuted} strokeWidth={1.75} />
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingVertical: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {query.trim().length === 0 ? (
          <Text
            style={[text.bodySm, { color: t.textMuted, paddingVertical: 24, textAlign: 'center' }]}
          >
            Type a series name to begin.
          </Text>
        ) : search.isLoading ? (
          <Text
            style={[text.bodySm, { color: t.textMuted, paddingVertical: 24, textAlign: 'center' }]}
          >
            Searching…
          </Text>
        ) : search.isError ? (
          <Text
            testID="err-search"
            style={[text.bodySm, { color: t.err, paddingVertical: 24, textAlign: 'center' }]}
          >
            Search failed.
          </Text>
        ) : search.data && search.data.results.length === 0 ? (
          <View style={{ padding: 24 }}>
            <EmptyState
              variant="muted"
              icon={SearchX}
              title={`No matches for "${query.trim()}"`}
              body="Check the spelling or widen the type filter."
            />
          </View>
        ) : (
          search.data?.results.map((r) => (
            <SearchResultRow
              key={r.sourceId}
              result={r}
              busy={add.isPending}
              disabled={disabledProps.disabled}
              onAdd={gate(() => onAdd(r))}
              onOpenInLibrary={() => navigation.navigate('SeriesOverview', { seriesId: '1' })}
            />
          ))
        )}
      </ScrollView>

      <GroupPickerSheet
        visible={pickerOpen}
        value={groupId}
        groups={groups}
        onSelect={setGroupId}
        onClose={() => setPickerOpen(false)}
        title="Add into"
      />
    </ScreenContainer>
  );
}
