import { PageHeader } from '@/components/shell/PageHeader';
import { NotificationsForm } from './NotificationsForm';

export const dynamic = 'force-dynamic';

export default function NotificationsSettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Get pinged on Discord or any Apprise endpoint when grabs and imports happen. Failures are surfaced separately so you can react."
      />
      <NotificationsForm />
    </div>
  );
}
