/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityTimeline, CurrentlyReading, FinishedShelf } from '@/app/(app)/profile/[userId]/ProfileSections';
import type { ProfileContinueItem, ProfileFinishedItem } from '@/app/(app)/profile/[userId]/data';
import type { ActivityFeedItem } from '@/server/db/activity-events';

function makeContinueItem(overrides: Partial<ProfileContinueItem> = {}): ProfileContinueItem {
  return {
    readableKey: 'page:file:1',
    title: 'Vinland Saga',
    contentType: 'manga',
    coverUrl: null,
    pct: 40,
    seriesId: 1,
    volumeNumber: null,
    volumeTitle: null,
    ...overrides,
  };
}

function makeFinishedItem(overrides: Partial<ProfileFinishedItem> = {}): ProfileFinishedItem {
  return {
    readableKey: 'page:file:2',
    title: 'Berserk',
    contentType: 'manga',
    coverUrl: null,
    seriesId: 2,
    volumeNumber: null,
    volumeTitle: null,
    ...overrides,
  };
}

describe('CurrentlyReading — volume label', () => {
  it('renders "Vol. N" for a manga item with volumeNumber', () => {
    render(
      <CurrentlyReading
        items={[makeContinueItem({ volumeNumber: 3 })]}
        name="paul"
        isYou={true}
      />,
    );
    expect(screen.getByText('Vol. 3')).toBeTruthy();
  });

  it('renders "Issue N" for a comic item with volumeNumber', () => {
    render(
      <CurrentlyReading
        items={[makeContinueItem({ contentType: 'comic', volumeNumber: 7 })]}
        name="paul"
        isYou={true}
      />,
    );
    expect(screen.getByText('Issue 7')).toBeTruthy();
  });

  it('renders volumeTitle when present (takes priority over number)', () => {
    render(
      <CurrentlyReading
        items={[makeContinueItem({ volumeNumber: 3, volumeTitle: 'Birth' })]}
        name="paul"
        isYou={true}
      />,
    );
    expect(screen.getByText('Birth')).toBeTruthy();
    expect(screen.queryByText('Vol. 3')).toBeNull();
  });

  it('renders no label when volumeNumber is null and volumeTitle is null', () => {
    render(
      <CurrentlyReading
        items={[makeContinueItem()]}
        name="paul"
        isYou={true}
      />,
    );
    expect(screen.queryByText(/Vol\./)).toBeNull();
    expect(screen.queryByText(/Issue/)).toBeNull();
  });
});

describe('FinishedShelf — volume label', () => {
  it('renders "Vol. N" for a manga finished item with volumeNumber', () => {
    render(<FinishedShelf items={[makeFinishedItem({ volumeNumber: 5 })]} />);
    expect(screen.getByText('Vol. 5')).toBeTruthy();
  });

  it('renders "Issue N" for a comic finished item', () => {
    render(<FinishedShelf items={[makeFinishedItem({ contentType: 'comic', volumeNumber: 12 })]} />);
    expect(screen.getByText('Issue 12')).toBeTruthy();
  });

  it('renders no volume label when null', () => {
    render(<FinishedShelf items={[makeFinishedItem()]} />);
    expect(screen.queryByText(/Vol\./)).toBeNull();
  });
});

function makeActivityItem(overrides: Partial<ActivityFeedItem> = {}): ActivityFeedItem {
  return {
    id: 1,
    userId: 1,
    kind: 'finished',
    seriesId: 1,
    volumeId: 1,
    meta: {},
    createdAt: new Date('2026-06-01T10:00:00Z'),
    seriesTitle: 'Bunny Drop',
    coverUrl: null,
    contentType: 'manga',
    volumeNumber: null,
    volumeTitle: null,
    ...overrides,
  };
}

describe('ActivityTimeline — volume label', () => {
  it('renders "Vol. N" for a manga activity item with volumeNumber', () => {
    render(<ActivityTimeline items={[makeActivityItem({ volumeNumber: 9 })]} />);
    expect(screen.getByText(/Vol\. 9/)).toBeTruthy();
  });

  it('renders "Issue N" for a comic activity item', () => {
    render(<ActivityTimeline items={[makeActivityItem({ contentType: 'comic', volumeNumber: 5 })]} />);
    expect(screen.getByText(/Issue 5/)).toBeTruthy();
  });

  it('renders volumeTitle in the activity row when present', () => {
    render(
      <ActivityTimeline
        items={[makeActivityItem({ volumeNumber: 9, volumeTitle: 'Epilogue' })]}
      />,
    );
    expect(screen.getByText(/Epilogue/)).toBeTruthy();
    expect(screen.queryByText(/Vol\. 9/)).toBeNull();
  });

  it('renders no volume label when volumeNumber is null', () => {
    render(<ActivityTimeline items={[makeActivityItem()]} />);
    expect(screen.queryByText(/Vol\./)).toBeNull();
    expect(screen.queryByText(/Issue/)).toBeNull();
  });
});
