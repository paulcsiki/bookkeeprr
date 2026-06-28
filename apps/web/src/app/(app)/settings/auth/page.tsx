import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSessionByToken } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { forwardAuthConfigSetting } from '@/server/db/settings/forward-auth';
import { PageHeader } from '@/components/shell/PageHeader';
import { OidcForm, type OidcFormConfig } from './OidcForm';
import { ForwardAuthForm, type ForwardAuthFormConfig } from './ForwardAuthForm';

export const dynamic = 'force-dynamic';

const MASK = '••••••••';

export default async function SettingsAuthPage(): Promise<React.JSX.Element> {
  const jar = await cookies();
  const token = jar.get('bookkeeprr_session')?.value ?? null;
  if (token === null) redirect('/login?next=/settings/auth');
  const session = await getSessionByToken(token);
  if (session === null || session.expiresAt <= new Date()) redirect('/login?next=/settings/auth');
  const user = await getUser(session.userId);
  if (user === null || user.disabled) redirect('/login?next=/settings/auth');
  if (user.role !== 'admin') redirect('/settings');

  const oidc = await oidcConfigSetting.get();
  const fwd = await forwardAuthConfigSetting.get();
  const oidcInitial: OidcFormConfig = {
    ...oidc,
    clientSecret: oidc.clientSecret.length > 0 ? MASK : '',
  };
  const forwardInitial: ForwardAuthFormConfig = { ...fwd };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Authentication"
        subtitle="Configure single sign-on providers. Local username and password sign-in always remains available as a fallback."
      />
      <OidcForm initial={oidcInitial} />
      <ForwardAuthForm initial={forwardInitial} />
    </div>
  );
}
