import { NextResponse } from 'next/server';
import type { GrabError } from '@/server/grabber';

/**
 * Map a grabber error to an HTTP response. Shared by the per-release grab route
 * and the interactive force-grab route so the status mapping stays in one place.
 * The `satisfies never` default makes a new GrabError variant a compile error
 * here rather than a silently-unmapped 500.
 */
export function mapGrabErrorToHttp(error: GrabError): Response {
  switch (error.code) {
    case 'not-found':
    case 'orphaned':
      return NextResponse.json({ error: error.message }, { status: 404 });
    case 'already-grabbed':
    case 'duplicate-grab':
      // Both mean "this torrent is already tracked by a download" — a conflict.
      return NextResponse.json({ error: error.message }, { status: 409 });
    case 'not-configured':
      return NextResponse.json(
        { error: error.message, hint: 'configure /settings/qbittorrent' },
        { status: 503 },
      );
    case 'malformed-link':
      return NextResponse.json({ error: error.message }, { status: 400 });
    case 'qbt-add-failed':
    case 'qbt-not-visible':
    case 'download-link-failed':
      return NextResponse.json({ error: error.message }, { status: 502 });
    default:
      error satisfies never;
      return NextResponse.json({ error: 'unknown grab error' }, { status: 500 });
  }
}
