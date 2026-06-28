// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReaderManifest } from '@bookkeeprr/types';
import { ReaderTopBar } from '@/components/reader/ReaderTopBar';
import { ProgressRail } from '@/components/reader/ProgressRail';
import { SettingsSheet, type SettingsState } from '@/components/reader/SettingsSheet';
import { TOCPanel } from '@/components/reader/TOCPanel';
import { RestartToast } from '@/components/reader/RestartToast';
import { chapterAt, posFromClientX } from '@/components/reader/lib/format';

function pagedManifest(): ReaderManifest {
  return {
    readableKey: 'page:file:1',
    contentType: 'ebook',
    reader: 'text',
    format: 'epub',
    title: 'The Lantern of the Deep',
    author: 'Wren Castellan',
    seriesId: 1,
    pageCount: 300,
    chapters: [
      { title: 'I. The Kessler Shelf', startPage: 1 },
      { title: 'II. Four Seconds', startPage: 40 },
      { title: 'III. Deliberate Silence', startPage: 120 },
    ],
    progress: {
      readableKey: 'page:file:1',
      position: 0,
      locator: null,
      finished: false,
      restartedFromFinish: false,
    },
  };
}

function audioManifest(): ReaderManifest {
  return {
    readableKey: 'audio:vol:9',
    contentType: 'audio',
    reader: 'audio',
    format: 'audio',
    title: 'The Three-Body Problem',
    author: 'Liu Cixin',
    seriesId: 2,
    totalSec: 3600,
    chapters: [
      { title: 'Prologue', startSec: 0 },
      { title: 'The Madman', startSec: 1200 },
    ],
    progress: {
      readableKey: 'audio:vol:9',
      position: 0,
      locator: null,
      finished: false,
      restartedFromFinish: false,
    },
  };
}

function defaultSettings(): SettingsState {
  return {
    theme: 'paper',
    auto: true,
    brightness: 1,
    warmth: 0,
    fontSize: 18,
    lineH: 1.6,
    font: 'serif',
    pageMode: 'paged',
    spread: 'single',
    dir: 'rtl',
    chromeMode: 'bar',
  };
}

describe('ReaderTopBar', () => {
  it('renders the manifest title', () => {
    const m = pagedManifest();
    render(<ReaderTopBar manifest={m} chapter={m.chapters?.[0]} bookmarked={false} />);
    expect(screen.getByText('The Lantern of the Deep')).toBeTruthy();
  });

  it('clicking Contents calls onTOC', () => {
    const onTOC = vi.fn();
    const m = pagedManifest();
    render(<ReaderTopBar manifest={m} chapter={m.chapters?.[0]} onTOC={onTOC} bookmarked={false} />);
    fireEvent.click(screen.getByLabelText('Contents'));
    expect(onTOC).toHaveBeenCalledTimes(1);
  });

  it('clicking Bookmark calls onBookmark', () => {
    const onBookmark = vi.fn();
    const m = pagedManifest();
    render(
      <ReaderTopBar manifest={m} chapter={m.chapters?.[0]} onBookmark={onBookmark} bookmarked={false} />,
    );
    fireEvent.click(screen.getByLabelText('Bookmark'));
    expect(onBookmark).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressRail', () => {
  it('shows a page label for a paged manifest', () => {
    const m = pagedManifest();
    render(<ProgressRail manifest={m} position={0.5} />);
    // ~page 150 of 300
    expect(screen.getByText(/Page 150/)).toBeTruthy();
  });

  it('shows a timecode for an audio manifest', () => {
    const m = audioManifest();
    render(<ProgressRail manifest={m} position={0.5} />);
    // 50% of 60 min = 30:00
    expect(screen.getByText('30:00')).toBeTruthy();
  });

  it('posFromClientX maps a click to a 0..1 position', () => {
    expect(posFromClientX(50, { left: 0, width: 100 })).toBeCloseTo(0.5);
    expect(posFromClientX(-10, { left: 0, width: 100 })).toBe(0);
    expect(posFromClientX(999, { left: 0, width: 100 })).toBe(1);
  });

  it('calls onScrub on pointer down', () => {
    const onScrub = vi.fn();
    const m = pagedManifest();
    const { container } = render(<ProgressRail manifest={m} position={0.5} onScrub={onScrub} />);
    const rail = container.querySelector('[data-reader-rail]') as HTMLElement;
    expect(rail).toBeTruthy();
    rail.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, height: 18, right: 200, bottom: 18, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerDown(rail, { clientX: 100 });
    expect(onScrub).toHaveBeenCalledTimes(1);
    expect(onScrub.mock.calls[0]![0]).toBeCloseTo(0.5);
  });
});

describe('SettingsSheet', () => {
  it('clicking a theme swatch calls set(theme, key)', () => {
    const set = vi.fn();
    render(<SettingsSheet st={defaultSettings()} set={set} kind="text" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Dark theme'));
    expect(set).toHaveBeenCalledWith('theme', 'dark');
  });

  it('kind=text renders font-size stepper', () => {
    render(<SettingsSheet st={defaultSettings()} set={vi.fn()} kind="text" onClose={vi.fn()} />);
    expect(screen.getByText('Font size')).toBeTruthy();
    expect(screen.getByText('Line spacing')).toBeTruthy();
  });

  it('kind=text font-size plus button raises the size', () => {
    const set = vi.fn();
    render(<SettingsSheet st={defaultSettings()} set={set} kind="text" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Increase font size'));
    expect(set).toHaveBeenCalledWith('fontSize', 19);
  });

  it('kind=comics renders spread options', () => {
    render(<SettingsSheet st={defaultSettings()} set={vi.fn()} kind="comics" onClose={vi.fn()} />);
    expect(screen.getByText('Spread')).toBeTruthy();
    expect(screen.getByText('Webtoon')).toBeTruthy();
  });

  it('toggling Auto calls set(auto, false)', () => {
    const set = vi.fn();
    render(<SettingsSheet st={defaultSettings()} set={set} kind="text" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Auto appearance'));
    expect(set).toHaveBeenCalledWith('auto', false);
  });
});

describe('TOCPanel', () => {
  it('clicking a chapter calls onJump with its start position', () => {
    const onJump = vi.fn();
    const m = pagedManifest();
    render(<TOCPanel manifest={m} position={0} onJump={onJump} onClose={vi.fn()} />);
    // chapter II starts at page 40 → (40-1)/300 = 0.13
    fireEvent.click(screen.getByText('II. Four Seconds'));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump.mock.calls[0]![0]).toBeCloseTo((40 - 1) / 300, 2);
  });

  it('Bookmarks tab shows the empty state', () => {
    const m = pagedManifest();
    render(<TOCPanel manifest={m} position={0} onJump={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Bookmarks'));
    expect(screen.getByText(/No bookmarks yet/i)).toBeTruthy();
  });
});

describe('RestartToast', () => {
  it('renders the starting-over message', () => {
    render(<RestartToast />);
    expect(screen.getByText(/starting over/i)).toBeTruthy();
  });
});

describe('chapterAt (manifest)', () => {
  it('resolves the chapter for a paged position', () => {
    const m = pagedManifest();
    expect(chapterAt(m, 0.5)?.title).toBe('III. Deliberate Silence');
    expect(chapterAt(m, 0)?.title).toBe('I. The Kessler Shelf');
  });
});
