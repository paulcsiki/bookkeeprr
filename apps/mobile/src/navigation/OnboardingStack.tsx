import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from './types';
import Welcome from '@/screens/onboarding/Welcome';
import Features from '@/screens/onboarding/Features';
import ServerUrl from '@/screens/onboarding/ServerUrl';
import TrustCert from '@/screens/onboarding/TrustCert';
import AuthHandoff from '@/screens/onboarding/AuthHandoff';
import Connected from '@/screens/onboarding/Connected';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Welcome" component={Welcome} />
      <Stack.Screen name="Features" component={Features} />
      <Stack.Screen name="ServerUrl" component={ServerUrl} />
      <Stack.Screen name="TrustCert" component={TrustCert} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AuthHandoff" component={AuthHandoff} />
      <Stack.Screen name="Connected" component={Connected} />
    </Stack.Navigator>
  );
}
