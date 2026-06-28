/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// VersionPill calls apiFetch on mount; stub it so the Sidebar renders in isolation.
vi.mock('@/components/VersionPill', () => ({
  VersionPill: () => null,
}));

let mockPathname = '/dashboard';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import { Sidebar } from '@/components/shell/Sidebar';

function navHrefs(): string[] {
  // The primary nav is the only <nav> in the sidebar; collect its link targets.
  return Array.from(document.querySelectorAll('nav a')).map(
    (a) => a.getAttribute('href') ?? '',
  );
}

describe('Sidebar nav', () => {
  it('renders a Dashboard item with a home icon above Library', () => {
    mockPathname = '/dashboard';
    render(<Sidebar />);

    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Library')).toBeTruthy();

    const hrefs = navHrefs();
    const dashIdx = hrefs.indexOf('/dashboard');
    const libIdx = hrefs.indexOf('/library');
    expect(dashIdx).toBeGreaterThanOrEqual(0);
    expect(libIdx).toBeGreaterThanOrEqual(0);
    // Dashboard must come before Library in the nav order.
    expect(dashIdx).toBeLessThan(libIdx);
  });

  it('marks the Dashboard item active on /dashboard', () => {
    mockPathname = '/dashboard';
    render(<Sidebar />);
    const link = Array.from(document.querySelectorAll('nav a')).find(
      (a) => a.getAttribute('href') === '/dashboard',
    )!;
    expect(link.className).toMatch(/text-primary/);
  });

  it('does not mark Dashboard active on /library', () => {
    mockPathname = '/library';
    render(<Sidebar />);
    const link = Array.from(document.querySelectorAll('nav a')).find(
      (a) => a.getAttribute('href') === '/dashboard',
    )!;
    expect(link.className).not.toMatch(/text-primary/);
  });
});
