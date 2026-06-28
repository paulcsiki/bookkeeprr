import { PageHeader } from '@/components/shell/PageHeader';
import { ApiKeyCard } from './ApiKeyCard';

export const dynamic = 'force-dynamic';

export default function ApiSettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader
        title="API Access"
        subtitle={
          <>
            Single static key. When generated, every <code>/api/*</code> request must include{' '}
            <code>X-Api-Key: &lt;key&gt;</code>. The bundled UI picks the key up automatically.{' '}
            <code>/api/health</code> and <code>/api/first-run/*</code> remain unauthenticated.
          </>
        }
      />
      <ApiKeyCard />
    </div>
  );
}
