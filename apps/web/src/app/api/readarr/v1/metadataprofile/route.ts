import { NextResponse } from 'next/server';
import { READARR_METADATA_PROFILES } from '@/server/readarr/profiles';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    READARR_METADATA_PROFILES.map((p) => ({
      id: p.id,
      name: p.name,
      minPopularity: 0,
      skipMissingDate: false,
      skipMissingIsbn: false,
      skipPartsAndSets: false,
      skipSeriesSecondary: false,
      allowedLanguages: 'eng',
      minPages: 0,
    })),
  );
}
