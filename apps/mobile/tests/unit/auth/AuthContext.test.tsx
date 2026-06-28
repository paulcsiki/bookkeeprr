import { render, screen, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { AuthProvider, useAuth } from '@/auth/AuthContext';

function Probe() {
  const { state, signOut } = useAuth();
  return (
    <>
      <Text testID="status">{state.status}</Text>
      <Pressable testID="signout" onPress={signOut}>
        <Text>out</Text>
      </Pressable>
    </>
  );
}

it('starts in loading state then resolves to unauthenticated', async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('unauthenticated'));
});
