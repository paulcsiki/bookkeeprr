import { Fragment } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Folder } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { mixSolid } from '@/theme/color';
import { DropTarget } from './GroupDndProvider';
import { crumbChain, type GroupNode } from './lib';

// Named to satisfy the no-color-literals lint rule (TabletSidebar pattern):
// idle crumb pills keep a transparent dashed border so the hot state doesn't
// shift layout.
const TRANSPARENT = 'transparent';

interface Props {
  groups: GroupNode[];
  /** The open group (the bar only renders in-group). */
  currentId: number;
  /** Tap navigation: null = library root, otherwise the crumb's group. */
  onNavigate: (id: number | null) => void;
}

/**
 * One breadcrumb pill. Every non-current crumb is BOTH a tap target and a
 * drop target (per TabLibraryGroups): hot = dashed primary border + solid
 * primary tint + primary text.
 */
function CrumbPill({
  dropId,
  label,
  icon,
  onPress,
  testID,
}: {
  dropId: string;
  label: string;
  icon: boolean;
  onPress: () => void;
  testID: string;
}) {
  const t = useTokens();
  return (
    <DropTarget id={dropId}>
      {(hot) => (
        <Pressable
          testID={testID}
          onPress={onPress}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: 7,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: hot ? t.primary : TRANSPARENT,
            backgroundColor: hot ? mixSolid(t.primary, t.surface, 0.16) : t.surface,
          }}
        >
          {icon ? (
            <Folder size={13} color={hot ? t.primary : t.textMuted} strokeWidth={1.7} />
          ) : null}
          <Text
            style={{
              fontFamily: fonts.sans.regular,
              fontSize: 12.5,
              color: hot ? t.primary : t.textMuted,
            }}
          >
            {label}
          </Text>
        </Pressable>
      )}
    </DropTarget>
  );
}

/**
 * Tablet breadcrumb row per docs/design/library-groups-screens.jsx
 * TabLibraryGroups: `Library / A / B` with every ancestor crumb a tap+drop
 * target and the current group rendered plain (no pill, not droppable),
 * plus the right-aligned mono drag hint.
 */
export function GroupCrumbsBar({ groups, currentId, onNavigate }: Props) {
  const t = useTokens();
  const chain = crumbChain(groups, currentId);
  return (
    <View
      testID="group-crumbs"
      style={{
        paddingHorizontal: 28,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <CrumbPill
        dropId="crumb-root"
        label="Library"
        icon={false}
        onPress={() => onNavigate(null)}
        testID="group-crumb-root"
      />
      {chain.map((g, i) => {
        const last = i === chain.length - 1;
        return (
          <Fragment key={g.id}>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>/</Text>
            {last ? (
              <View
                testID={`group-crumb-${g.id}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                }}
              >
                <Folder size={13} color={t.text} strokeWidth={1.7} />
                <Text
                  style={{
                    fontFamily: fonts.sans.medium,
                    fontSize: 12.5,
                    fontWeight: '500',
                    color: t.text,
                  }}
                >
                  {g.name}
                </Text>
              </View>
            ) : (
              <CrumbPill
                dropId={`crumb-${g.id}`}
                label={g.name}
                icon
                onPress={() => onNavigate(g.id)}
                testID={`group-crumb-${g.id}`}
              />
            )}
          </Fragment>
        );
      })}
      <Text
        style={{
          marginLeft: 'auto',
          fontFamily: fonts.mono.regular,
          fontSize: 10,
          letterSpacing: 0.6, // 0.06em × 10px
          color: t.textMuted,
        }}
      >
        DRAG A COVER ONTO A FOLDER OR CRUMB TO MOVE IT
      </Text>
    </View>
  );
}
