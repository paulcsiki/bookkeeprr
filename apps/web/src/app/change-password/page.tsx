import { ChangePasswordForm } from './ChangePasswordForm';

export const dynamic = 'force-dynamic';

export default function ChangePasswordPage(): React.JSX.Element {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold font-display text-center">Change password</h1>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
