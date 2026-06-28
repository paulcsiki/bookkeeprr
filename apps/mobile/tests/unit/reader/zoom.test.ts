import {
  ZOOM_MIN,
  ZOOM_MAX,
  clampZoom,
  toggleZoom,
  panBound,
  clampPan,
  type Pan,
} from '@/features/reader/lib/zoom';

describe('reader zoom math', () => {
  describe('clampZoom', () => {
    it('clamps below the minimum up to 1', () => {
      expect(clampZoom(0)).toBe(ZOOM_MIN);
      expect(clampZoom(-3)).toBe(ZOOM_MIN);
      expect(clampZoom(0.5)).toBe(1);
    });

    it('clamps above the maximum down to 3', () => {
      expect(clampZoom(4)).toBe(ZOOM_MAX);
      expect(clampZoom(99)).toBe(3);
    });

    it('passes through values in range', () => {
      expect(clampZoom(1)).toBe(1);
      expect(clampZoom(2)).toBe(2);
      expect(clampZoom(2.5)).toBe(2.5);
      expect(clampZoom(3)).toBe(3);
    });

    it('treats NaN as the minimum', () => {
      expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
    });
  });

  describe('toggleZoom', () => {
    it('zooms in from 1x to 2x', () => {
      expect(toggleZoom(1)).toBe(2);
    });

    it('resets to 1x when already zoomed', () => {
      expect(toggleZoom(2)).toBe(1);
      expect(toggleZoom(1.4)).toBe(1);
      expect(toggleZoom(3)).toBe(1);
    });
  });

  describe('panBound', () => {
    it('is zero when content fits the container', () => {
      expect(panBound(400, 200)).toBe(0);
      expect(panBound(400, 400)).toBe(0);
    });

    it('is half the overflow when content exceeds the container', () => {
      expect(panBound(400, 800)).toBe(200);
      expect(panBound(400, 600)).toBe(100);
    });
  });

  describe('clampPan', () => {
    const container = { w: 400, h: 600 };

    it('clamps each axis to its half-overflow bound', () => {
      const content = { w: 800, h: 1200 };
      const within: Pan = { x: 50, y: -100 };
      expect(clampPan(within, container, content)).toEqual({ x: 50, y: -100 });

      const over: Pan = { x: 999, y: -999 };
      expect(clampPan(over, container, content)).toEqual({ x: 200, y: -300 });
    });

    it('pins to center when content fits', () => {
      const content = { w: 300, h: 500 };
      expect(clampPan({ x: 120, y: -80 }, container, content)).toEqual({ x: 0, y: 0 });
    });
  });
});
