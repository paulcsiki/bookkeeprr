import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';
import { QueryProvider } from '@/components/QueryProvider';
import { ChangelogDialog } from '@/components/ChangelogDialog';
import { AddDialogProvider } from '@/components/add/AddDialogProvider';
import { BreadcrumbLabelProvider } from '@/components/shell/BreadcrumbLabels';

export default function AppLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <QueryProvider>
      <AddDialogProvider>
        <BreadcrumbLabelProvider>
          <div className="flex h-screen">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-auto p-6">{children}</main>
            </div>
          </div>
        </BreadcrumbLabelProvider>
        {/* Authenticated-only — must live under QueryProvider since it uses
            useChangelogSeen → useQuery. Was at root layout, which broke /login
            server-render (the unauthenticated route has no QueryClient). */}
        <ChangelogDialog />
      </AddDialogProvider>
    </QueryProvider>
  );
}
