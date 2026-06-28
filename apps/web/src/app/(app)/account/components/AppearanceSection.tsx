'use client';

import { AppearanceDialog } from '@bookkeeprr/ui';

export function AppearanceSection(): React.JSX.Element {
  // Non-modal inline use — open is always true, onOpenChange is a no-op,
  // and `inline` drops the dialog's own card + heading (the section supplies it).
  return <AppearanceDialog open inline onOpenChange={() => {}} />;
}
