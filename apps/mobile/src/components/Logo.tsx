import { View, Text } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';

export function LogoMark({ size = 32, testID }: { size?: number; testID?: string }) {
  const t = useTokens();
  const svgProps = testID === undefined ? {} : { testID };
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" {...svgProps}>
      <Circle cx={32} cy={32} r={30} fill={t.primary} />
      <Rect x={14} y={22.5} width={32} height={5} rx={1} fill={t.bg} />
      <Rect x={14} y={30.5} width={36} height={5} rx={1} fill={t.bg} />
      <Rect x={14} y={38.5} width={22} height={5} rx={1} fill={t.bg} />
    </Svg>
  );
}

export function Logo({ testID }: { testID?: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} testID={testID}>
      <LogoMark size={28} />
      <Text style={[text.displayMd, { color: t.text }]}>
        bookkeep<Text style={{ color: t.primary }}>rr</Text>
      </Text>
    </View>
  );
}
