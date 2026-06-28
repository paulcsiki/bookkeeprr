/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, colorFromSeed } from '@bookkeeprr/ui';

describe('Avatar', () => {
  it('renders initials from the name as the fallback', () => {
    render(<Avatar name="Maya Chen" email="maya@example.com" />);
    expect(screen.getByText('MC')).toBeTruthy();
  });

  it('uses md5(email) for the Gravatar URL', () => {
    const { container } = render(<Avatar name="Maya Chen" email="MAYA@EXAMPLE.COM " size={40} />);
    const img = container.querySelector('img');
    expect(img?.src).toMatch(/gravatar.com\/avatar\/[a-f0-9]{32}\?s=80&d=404/);
    // md5('maya@example.com') = 7f042523605eb9acbaa4df4ae2d4f20b
    expect(img?.src).toContain('7f042523605eb9acbaa4df4ae2d4f20b');
  });

  it('exposes an accessible label', () => {
    render(<Avatar name="Maya Chen" email="maya@example.com" alt="Avatar for Maya" />);
    expect(screen.getByRole('img', { name: 'Avatar for Maya' })).toBeTruthy();
  });

  it('applies .avatar and .a-{n} classes from the variant prop', () => {
    const { container } = render(<Avatar name="Maya Chen" email="maya@example.com" variant={3} />);
    const el = container.querySelector('[role="img"]');
    expect(el?.classList.contains('avatar')).toBe(true);
    expect(el?.classList.contains('a-3')).toBe(true);
  });

  it('defaults to variant 1 when no variant is provided', () => {
    const { container } = render(<Avatar name="Maya Chen" email="maya@example.com" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.classList.contains('a-1')).toBe(true);
  });
});

describe('colorFromSeed', () => {
  it('returns a value in range 1-5', () => {
    const seeds = ['maya@example.com', 'sofia@example.org', 'toni@example.org', 'rohan@example.org', 'lina@example.org', ''];
    for (const seed of seeds) {
      const v = colorFromSeed(seed);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('is deterministic — same seed always returns same value', () => {
    const seed = 'paul@bookkeeprr.local';
    const first = colorFromSeed(seed);
    for (let i = 0; i < 10; i++) {
      expect(colorFromSeed(seed)).toBe(first);
    }
  });

  it('produces distinct values for different seeds', () => {
    const values = new Set(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com', 'g@x.com'].map(colorFromSeed));
    // With 7 seeds over 5 slots, we expect at least 2 distinct values
    expect(values.size).toBeGreaterThanOrEqual(2);
  });
});
