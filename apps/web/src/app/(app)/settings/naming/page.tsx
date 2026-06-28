import { redirect } from 'next/navigation';
import { isContentType, type ContentType } from '@/server/content-type';
import { getAllNamingTemplates } from '@/server/db/settings/naming';
import { PageHeader } from '@/components/shell/PageHeader';
import { NamingForm } from './NamingForm';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ contentType?: string }>;
};

export default async function NamingSettingsPage({
  searchParams,
}: Props): Promise<React.JSX.Element> {
  const sp = await searchParams;
  const requested = sp.contentType;
  if (requested !== undefined && !isContentType(requested)) {
    redirect('/settings/naming');
  }
  const contentType: ContentType = isContentType(requested) ? requested : 'manga';
  const templates = await getAllNamingTemplates(contentType);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Naming Templates"
        subtitle={
          <>
            Tokens like <code>{'{series_title}'}</code>, <code>{'{volume:00}'}</code> render at
            import time. All paths pass through a sanitization step at the end (strips illegal
            characters).
          </>
        }
      />
      <NamingForm key={contentType} initial={templates} contentType={contentType} />
    </div>
  );
}
