import { View, Pressable, type ViewStyle } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import type { ReactNode } from 'react';

interface Props {
  testID?: string;
  onDismiss: () => void;
  children: ReactNode;
  contentStyle?: ViewStyle;
}

export function BottomSheet({ testID, onDismiss, children, contentStyle }: Props) {
  const t = useTokens();
  return (
    <View testID={testID} style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable
        testID={testID ? `${testID}-scrim` : undefined}
        accessibilityLabel="Dismiss"
        onPress={onDismiss}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: t.scrim,
        }}
      />
      <View
        style={[
          {
            backgroundColor: t.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderTopWidth: 1,
            borderColor: t.border,
            paddingTop: 8,
            paddingBottom: 28,
          },
          contentStyle,
        ]}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 36,
            height: 4,
            borderRadius: 999,
            backgroundColor: t.border,
            marginTop: 6,
            marginBottom: 10,
          }}
        />
        {children}
      </View>
    </View>
  );
}
