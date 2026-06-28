import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { tokenStore, type Credentials } from './token-store';

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; creds: Credentials };

interface AuthActions {
  state: AuthState;
  signIn: (creds: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthActions | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  useEffect(() => {
    tokenStore
      .load()
      .then((c) =>
        setState(c ? { status: 'authenticated', creds: c } : { status: 'unauthenticated' }),
      )
      // A secure-store read failure must not brick the app on a blank loading
      // screen — fall back to unauthenticated so onboarding can render.
      .catch(() => setState({ status: 'unauthenticated' }));
  }, []);
  const value = useMemo<AuthActions>(
    () => ({
      state,
      async signIn(creds) {
        await tokenStore.save(creds);
        setState({ status: 'authenticated', creds });
      },
      async signOut() {
        await tokenStore.clear();
        setState({ status: 'unauthenticated' });
      },
    }),
    [state],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthActions {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
