import { AccountSection } from '../components/AccountSection';
import { SessionsSection } from '../components/SessionsSection';

export default function AccountSessionsPage(): React.JSX.Element {
  return (
    <AccountSection
      title="Active sessions"
      desc="Devices currently signed in to your account. Revoking signs that device out immediately."
      fill
    >
      <SessionsSection />
    </AccountSection>
  );
}
