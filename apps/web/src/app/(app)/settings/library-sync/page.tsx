import { PageHeader } from '@/components/shell/PageHeader';
import { AudiobookshelfCard } from './AudiobookshelfCard';
import { CalibreCard } from './CalibreCard';

export const dynamic = 'force-dynamic';

export default function LibrarySyncSettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Library Sync"
        subtitle="After bookkeeprr imports a new file, ping your downstream player so it rescans and picks up the new content automatically."
      />
      <AudiobookshelfCard />
      <CalibreCard />
    </div>
  );
}
