import { AccountSection } from '../components/AccountSection';
import { TotpSection } from '../components/TotpSection';

export default function AccountTwoFactorPage(): React.JSX.Element {
  return (
    <AccountSection
      title="Two-factor"
      desc="A TOTP code from your authenticator app, required on every new device."
    >
      <TotpSection />
    </AccountSection>
  );
}
