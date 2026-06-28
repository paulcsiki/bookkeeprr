import { PageHeader } from '@/components/shell/PageHeader';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { QbtConfigForm } from './QbtConfigForm';

export const dynamic = 'force-dynamic';

export default async function QbtSettingsPage(): Promise<React.JSX.Element> {
  const cfg = await qbtConnectionSetting.get();
  return (
    <div className="space-y-6">
      <PageHeader
        title="qBittorrent"
        subtitle="Configure connection to your existing qBittorrent instance. Credentials are stored plaintext in the local SQLite DB (`/config/bookkeeprr.db`). The file-system permissions on `/config` are the security boundary."
      />
      <QbtConfigForm
        initial={{
          host: cfg.host,
          port: cfg.port,
          username: cfg.username,
          password: cfg.password.length > 0 ? '****' : '',
          useHttps: cfg.useHttps,
        }}
      />
    </div>
  );
}
