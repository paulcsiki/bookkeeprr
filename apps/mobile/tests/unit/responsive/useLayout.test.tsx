import { renderHook } from '@testing-library/react-native';
import { useLayout } from '@/responsive/useLayout';
import { classFor } from '@/responsive/breakpoints';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockUseWindowDimensions = require('react-native/Libraries/Utilities/useWindowDimensions')
  .default as jest.Mock;

describe('classFor', () => {
  it('< 600 is phone', () => {
    expect(classFor(599, 400)).toBe('phone');
  });
  it('600 to <900 is tablet-portrait', () => {
    expect(classFor(600, 800)).toBe('tablet-portrait');
    expect(classFor(820, 1180)).toBe('tablet-portrait');
  });
  it('>=900 is tablet-landscape', () => {
    expect(classFor(900, 600)).toBe('tablet-landscape');
    expect(classFor(1180, 820)).toBe('tablet-landscape');
  });
});

describe('useLayout', () => {
  it('returns class for phone width', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 402, height: 874 });
    const { result } = await renderHook(() => useLayout());
    expect(result.current.class).toBe('phone');
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isLandscape).toBe(false);
  });

  it('returns class for tablet portrait', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 820, height: 1180 });
    const { result } = await renderHook(() => useLayout());
    expect(result.current.class).toBe('tablet-portrait');
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isLandscape).toBe(false);
  });

  it('returns class for tablet landscape', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1180, height: 820 });
    const { result } = await renderHook(() => useLayout());
    expect(result.current.class).toBe('tablet-landscape');
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isLandscape).toBe(true);
  });
});
