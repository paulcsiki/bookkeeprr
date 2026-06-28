import { notFound } from 'next/navigation';
import { Reader } from '@/components/reader/Reader';

/** Pick the first value of a possibly-array search param. */
function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Open the reader for a single paged library file addressed by its `fileId`. */
export default async function ReadFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ fileId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const { fileId } = await params;
  const id = Number(fileId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }
  const { loc } = await searchParams;
  return <Reader fileId={id} loc={firstParam(loc)} />;
}
