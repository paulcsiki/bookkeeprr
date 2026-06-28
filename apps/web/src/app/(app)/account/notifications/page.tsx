import { AccountSection } from '../components/AccountSection';
import { NotificationsSection } from '../components/NotificationsSection';

export default function AccountNotificationsPage(): React.JSX.Element {
  return (
    <AccountSection title="Notifications" desc="Where and how bookkeeprr notifies you.">
      <NotificationsSection />
    </AccountSection>
  );
}
