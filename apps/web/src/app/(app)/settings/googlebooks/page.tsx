import { PageHeader } from '@/components/shell/PageHeader';
import { googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import { GoogleBooksForm } from './GoogleBooksForm';

export const dynamic = 'force-dynamic';

export default async function GoogleBooksSettingsPage(): Promise<React.JSX.Element> {
  const apiKey = await googleBooksApiKeySetting.get();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Books"
        subtitle={
          <>
            Optional API key for novel volume counts, covers, and descriptions. Works without a key
            at a low daily quota; add a key to raise it. Create one in the{' '}
            <a
              href="https://console.cloud.google.com/apis/library/books.googleapis.com"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Cloud console
            </a>
            .
          </>
        }
      />
      <GoogleBooksForm initialApiKey={apiKey.length > 0 ? '****' : ''} />
    </div>
  );
}
