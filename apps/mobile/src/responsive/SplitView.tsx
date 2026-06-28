import { View } from 'react-native';
import type { ReactNode } from 'react';
import { useTokens } from '@/theme/ThemeProvider';

interface Props {
  left: ReactNode;
  right: ReactNode;
  leftFlex?: number;
  rightFlex?: number;
  testID?: string;
}

export function SplitView({ left, right, leftFlex = 1, rightFlex = 1.4, testID }: Props) {
  const t = useTokens();
  return (
    <View testID={testID} style={{ flex: 1, flexDirection: 'row' }}>
      <View
        testID={testID ? `${testID}-left` : undefined}
        style={{
          flex: leftFlex,
          borderRightWidth: 1,
          borderRightColor: t.border,
          minWidth: 0,
        }}
      >
        {left}
      </View>
      <View
        testID={testID ? `${testID}-right` : undefined}
        style={{ flex: rightFlex, minWidth: 0 }}
      >
        {right}
      </View>
    </View>
  );
}
