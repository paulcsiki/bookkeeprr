import { View, Text, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useLibraryFilter, type LibrarySort } from '@/state/libraryFilterStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SORT_OPTIONS: Array<{ value: LibrarySort; label: string }> = [
  { value: 'added_at:desc', label: 'Recently added' },
  { value: 'title:asc', label: 'Title A → Z' },
  { value: 'added_at:asc', label: 'Date added (oldest)' },
  { value: 'volumes:desc', label: 'Most volumes' },
  { value: 'progress:asc', label: 'Least progress' },
];

export function LibrarySortSheet({ open, onClose }: Props) {
  const t = useTokens();
  const { sort, setSort } = useLibraryFilter();

  if (!open) return null;

  return (
    <BottomSheet onDismiss={onClose}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        <Text style={[text.displaySm, { color: t.text, marginBottom: 16 }]}>Sort by</Text>
        {SORT_OPTIONS.map((opt) => {
          const active = sort === opt.value;
          return (
            <Pressable
              key={opt.value}
              testID={`sort-opt-${opt.value}`}
              onPress={() => {
                setSort(opt.value);
                onClose();
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: t.border,
              }}
            >
              <Text style={[text.label, { color: active ? t.primary : t.text }]}>{opt.label}</Text>
              {active ? <Check size={16} color={t.primary} strokeWidth={2} /> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}
