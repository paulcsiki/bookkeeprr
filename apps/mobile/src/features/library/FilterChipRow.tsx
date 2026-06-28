import { ScrollView } from 'react-native';
import { Chip } from '@/components/Chip';
import { useLibraryFilter } from '@/state/libraryFilterStore';
import { TYPE_LABEL } from './seriesMeta';
import type { ContentType, SeriesSummary } from '@/api/schemas';

const TYPES: ContentType[] = ['manga', 'novel', 'comic', 'ebook', 'audio'];

// Persistent content-type selector with per-type counts. The type filter is
// EXCLUSIVE: "All" or exactly one type. Tapping a type selects only it; tapping
// the active type clears back to All. Zero-count chips dim and ignore presses.
// Status/sort live in the filter sheet.
export function FilterChipRow({ rows }: { rows: SeriesSummary[] }) {
  const { contentTypes, setContentTypes } = useLibraryFilter();
  const countOf = (ct: ContentType) => rows.filter((r) => r.contentType === ct).length;

  return (
    // flexGrow/flexShrink 0 pins the row to its natural (chip + padding) height.
    // Without it the row is a shrinkable flex child beside the greedy content
    // ScrollView below, so the column compresses it and the next sibling rides
    // up over the chips' rounded bottoms (the "pills cropped from underneath"
    // bug). paddingBottom gives the rounded bottoms a touch more clearance.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -20, flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 }}
    >
      <Chip
        testID="chip-all"
        active={contentTypes.length === 0}
        count={rows.length}
        onPress={() => setContentTypes([])}
      >
        All
      </Chip>
      {TYPES.map((ct) => {
        const count = countOf(ct);
        const isActive = contentTypes.includes(ct);
        return (
          <Chip
            key={ct}
            testID={`chip-${ct}`}
            kind={ct}
            active={isActive}
            count={count}
            zero={count === 0 && !isActive}
            onPress={() => setContentTypes(isActive ? [] : [ct])}
          >
            {TYPE_LABEL[ct]}
          </Chip>
        );
      })}
    </ScrollView>
  );
}
