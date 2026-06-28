import { notFound } from 'next/navigation';
import { Reader } from '@/components/reader/Reader';

/** Pick the first value of a possibly-array search param. */
function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Open the reader for an audio volume addressed by its `volumeId`. */
export default async function ReadVolumePage({
  params,
  searchParams,
}: {
  params: Promise<{ volumeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const { volumeId } = await params;
  const id = Number(volumeId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }
  const { loc } = await searchParams;
  return <Reader volumeId={id} loc={firstParam(loc)} />;
}
