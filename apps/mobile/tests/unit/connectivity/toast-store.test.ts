import { useToasts, toast, dismissToast } from '@/state/toastStore';

beforeEach(() => useToasts.setState({ toasts: [] }));

it('enqueues a toast with an id and defaults', () => {
  toast({ message: 'hi' });
  const t = useToasts.getState().toasts;
  expect(t).toHaveLength(1);
  expect(t[0]).toMatchObject({ message: 'hi', tone: 'info' });
  expect(typeof t[0]?.id).toBe('string');
});

it('dismiss removes by id', () => {
  toast({ message: 'a' });
  const id = useToasts.getState().toasts[0]!.id;
  dismissToast(id);
  expect(useToasts.getState().toasts).toHaveLength(0);
});

it('coalesces identical consecutive messages (no duplicate spam)', () => {
  toast({ message: 'You’re offline' });
  toast({ message: 'You’re offline' });
  expect(useToasts.getState().toasts).toHaveLength(1);
});
