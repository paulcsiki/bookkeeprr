import { useWindowDimensions } from 'react-native';
import { classFor, type LayoutClass } from './breakpoints';

export interface LayoutInfo {
  class: LayoutClass;
  width: number;
  height: number;
  isTablet: boolean;
  isLandscape: boolean;
}

export function useLayout(): LayoutInfo {
  const { width, height } = useWindowDimensions();
  const forced = process.env.EXPO_PUBLIC_MOBILE_E2E_FORCE_TABLET as
    | 'tablet-portrait'
    | 'tablet-landscape'
    | undefined;
  const cls = forced ?? classFor(width, height);
  const isTablet = cls !== 'phone';
  const isLandscape = cls === 'tablet-landscape';
  return { class: cls, width, height, isTablet, isLandscape };
}
