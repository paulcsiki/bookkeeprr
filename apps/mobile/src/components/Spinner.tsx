import { ActivityIndicator } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';

type Props = {
  size?: 'sm' | 'lg';
  color?: string;
  testID?: string;
};

export function Spinner({ size = 'sm', color, testID }: Props) {
  const t = useTokens();
  return (
    <ActivityIndicator
      testID={testID}
      size={size === 'lg' ? 'large' : 'small'}
      color={color ?? t.primary}
    />
  );
}
