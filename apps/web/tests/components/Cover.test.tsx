/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Cover } from '@/components/Cover';

afterEach(() => vi.restoreAllMocks());

describe('Cover', () => {
  it('renders the tinted fallback (title + type label) when there is no src', () => {
    render(<Cover contentType="manga" title="Chainsaw Man" />);
    expect(screen.getByText('Chainsaw Man')).toBeTruthy();
    expect(screen.getByText('Manga')).toBeTruthy();
    // No image element when there is no URL.
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('uses the per-type label (light_novel -> Novel)', () => {
    render(<Cover contentType="light_novel" title="Mushoku Tensei" />);
    expect(screen.getByText('Novel')).toBeTruthy();
  });

  it('renders the image while loading, with the fallback underneath', () => {
    render(<Cover contentType="comic" title="Saga" src="https://example.com/c.jpg" />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://example.com/c.jpg');
    // Not yet loaded — image is not marked loaded.
    expect(img.className).not.toContain('is-loaded');
    // Fallback still present (revealed if the image errors).
    expect(screen.getByText('Saga')).toBeTruthy();
  });

  it('marks the image loaded on load', () => {
    render(<Cover contentType="ebook" title="Dune" src="https://example.com/d.jpg" />);
    const img = screen.getByRole('img') as HTMLImageElement;
    fireEvent.load(img);
    expect(img.className).toContain('is-loaded');
  });

  it('drops the image and falls back when it fails to load', () => {
    render(<Cover contentType="audiobook" title="The Martian" src="https://example.com/x.jpg" />);
    fireEvent.error(screen.getByRole('img'));
    // Image removed from paint; fallback (title + Audio label) remains.
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('The Martian')).toBeTruthy();
    expect(screen.getByText('Audio')).toBeTruthy();
  });

  it('omits the type label when hideType is set', () => {
    render(<Cover contentType="manga" title="Berserk" hideType />);
    expect(screen.queryByText('Manga')).toBeNull();
    expect(screen.getByText('Berserk')).toBeTruthy();
  });

  it('shows a cached image (already complete at mount) as loaded — skeleton not stuck on top', () => {
    // Warm cache: the <img> is already `complete` with pixels when React mounts,
    // so its `load` event has already fired and won't fire again. The ref
    // callback must mark it loaded, and the mount-time [src] effect must NOT
    // reset it back to 'loading' (which previously left the skeleton painted
    // over a fully-loaded cover after a refresh).
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(640);

    render(<Cover contentType="manga" title="Bunny Drop" src="https://example.com/b.jpg" />);

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.className).toContain('is-loaded');
    // The loading shimmer must be gone.
    expect(document.querySelector('.cv-skel')).toBeNull();
  });

  it('renders overlay children', () => {
    render(
      <Cover contentType="manga" title="One Piece" src="https://example.com/o.jpg">
        <span>BADGE</span>
      </Cover>,
    );
    expect(screen.getByText('BADGE')).toBeTruthy();
  });
});
