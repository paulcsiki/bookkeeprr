import { AccountSection } from '../components/AccountSection';
import { ApiKeysSection } from '../components/ApiKeysSection';

export default function AccountApiKeysPage(): React.JSX.Element {
  return (
    <AccountSection
      title="API keys"
      desc="Personal tokens for the API and CLI. Treat them like passwords."
    >
      <ApiKeysSection />
    </AccountSection>
  );
}
