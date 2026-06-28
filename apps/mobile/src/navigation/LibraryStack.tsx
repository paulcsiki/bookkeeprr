import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { LibraryStackParamList } from './types';
import LibraryHome from '@/screens/library/LibraryHome';
import SeriesOverview from '@/screens/library/SeriesOverview';
import SeriesVolumes from '@/screens/library/SeriesVolumes';
import AddSeries from '@/screens/library/AddSeries';
import FilterSheet from '@/screens/library/FilterSheet';
import InteractiveSearch from '@/screens/library/InteractiveSearch';
import BookSeriesDetail from '@/screens/library/BookSeriesDetail';
import Reader from '@/screens/reader/Reader';
import { useTokens } from '@/theme/ThemeProvider';

const Stack = createNativeStackNavigator<LibraryStackParamList>();

export function LibraryStack() {
  const t = useTokens();
  return (
    // `contentStyle` themes the card background for every screen — without it,
    // modal-presented screens (AddSeries / InteractiveSearch) show the system
    // default (white in light mode) around the dark content, reading as a
    // white border around the sheet. The transparentModal FilterSheet overrides
    // it back to transparent below.
    <Stack.Navigator initialRouteName="LibraryHome" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Screen name="LibraryHome" component={LibraryHome} />
      <Stack.Screen name="SeriesOverview" component={SeriesOverview} />
      <Stack.Screen name="SeriesVolumes" component={SeriesVolumes} />
      <Stack.Screen
        name="AddSeries"
        component={AddSeries}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="FilterSheet"
        component={FilterSheet}
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="InteractiveSearch"
        component={InteractiveSearch}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="BookSeriesDetail" component={BookSeriesDetail} />
      <Stack.Screen
        name="Reader"
        component={Reader}
        options={{ presentation: 'fullScreenModal', headerShown: false }}
      />
    </Stack.Navigator>
  );
}
