import { AccountSection } from '../components/AccountSection';
import { SecuritySection } from '../components/SecuritySection';

export default function AccountSecurityPage(): React.JSX.Element {
  return (
    <AccountSection
      title="Security"
      desc="Local accounts only. At least 8 characters; you'll be signed out of other sessions on change."
    >
      <SecuritySection />
    </AccountSection>
  );
}
