import { NextResponse } from 'next/server';
import { comicVineApiKeySetting, isComicVineConfigured } from '@/server/db/settings/comicvine';

export const dynamic = 'force-dynamic';

export interface DiscoverSource {
  id: 'anilist' | 'mangadex' | 'comicvine' | 'openlibrary' | 'audnex';
  label: string;
  configured: boolean;
}

export async function GET(): Promise<NextResponse> {
  const comicVineApiKey = await comicVineApiKeySetting.get();
  const sources: DiscoverSource[] = [
    { id: 'anilist',     label: 'AniList',     configured: true },
    { id: 'mangadex',   label: 'MangaDex',    configured: true },
    { id: 'comicvine',  label: 'ComicVine',   configured: isComicVineConfigured(comicVineApiKey) },
    { id: 'openlibrary', label: 'OpenLibrary', configured: true },
    { id: 'audnex',     label: 'Audnex',      configured: true },
  ];
  return NextResponse.json({ sources });
}
