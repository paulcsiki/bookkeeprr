import { AccountSection } from '../components/AccountSection';
import { AppearanceSection } from '../components/AppearanceSection';

export default function AccountAppearancePage(): React.JSX.Element {
  return (
    <AccountSection title="Appearance" desc="Theme, accent color, and light or dark mode.">
      <AppearanceSection />
    </AccountSection>
  );
}
