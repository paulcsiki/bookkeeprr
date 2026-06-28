import { LoginForm } from './LoginForm';
import { CoverWall } from '@bookkeeprr/ui';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; return_to?: string }>;
}): Promise<React.JSX.Element> {
  // The mobile/tablet app opens this page inside an iOS auth session, passing a
  // `return_to` deep-link. That session presents as a narrow centered card on
  // iPad (so the form must center, not left-align) and suppresses the decorative
  // cover-wall drift — `.login-embedded` re-centers the form and keeps the wall
  // animating in that context.
  const sp = await searchParams;
  const embedded = typeof sp.return_to === 'string' && sp.return_to.length > 0;
  return (
    <main className={`login-stage${embedded ? ' login-embedded' : ''}`}>
      {/* `responsive` sizes the wall to the viewport (12×10 is the floor / SSR seed).
          Large/ultrawide screens add columns and rows, repeating the 120-cover pool as needed. */}
      <CoverWall cols={12} perCol={10} responsive />
      <div className="login-scrim" />
      <div className="login-vignette" />
      <div className="login-content">
        <LoginForm searchParamsPromise={searchParams} />
      </div>
    </main>
  );
}
