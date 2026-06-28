import { describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';

// redirect() throws in Next's runtime; stub it so we can assert the target
// without halting the test on a thrown control-flow signal.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import Home from '@/app/page';

describe('root route', () => {
  it('redirects / to the dashboard (the new home)', () => {
    expect(() => Home()).toThrow('REDIRECT:/dashboard');
    expect(redirect).toHaveBeenCalledWith('/dashboard');
    expect(redirect).not.toHaveBeenCalledWith('/library');
  });
});
