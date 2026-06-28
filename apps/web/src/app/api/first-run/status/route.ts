import { NextResponse } from 'next/server';
import { firstRunCompleteSetting } from '@/server/db/settings/first-run';

export async function GET(): Promise<Response> {
  const complete = await firstRunCompleteSetting.get();
  return NextResponse.json({ complete });
}
