import { AccountSection } from '../components/AccountSection';
import { DangerZone } from '../components/DangerZone';

export default function AccountDangerPage(): React.JSX.Element {
  return (
    <AccountSection title="Danger zone" desc="Irreversible actions for your account.">
      <DangerZone />
    </AccountSection>
  );
}
