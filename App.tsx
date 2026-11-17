import React, { useEffect,useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthProvider, useAuth } from './Src/Context/AuthContext';
import AuthNavigator from './Src/Navigation/AuthNavigator';
import AppNavigator from './Src/Navigation/AppNavigator';
import IntroScreen from './Src/Screens/IntroScreen';
import { navigationRef, openPatientsForPendingAlert } from './Src/Navigation/navigationRef';
import { startPushListeners } from './Src/Services/locationNative';
import AsyncStorage from '@react-native-async-storage/async-storage';


import BoundaryAlertOverlay from './Src/Components/Location/BoundaryAlertOverlay';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { state, bootstrapAsync } = useAuth();
  const [appState, setAppState] = useState<
    'loading' | 'intro' | 'auth' | 'app'
  >('loading');
  // Stays false until the saved session has been restored, so the token effect
  // below cannot flash the login screen before the restore lands.
  const bootstrapped = React.useRef(false);

  useEffect(() => startPushListeners(), []);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    // Decide from bootstrap's own result: state inside this closure is stale.
    const restored = await bootstrapAsync();

    const hasLaunched = await AsyncStorage.getItem('hasLaunched');

    if (!hasLaunched) {
      await AsyncStorage.setItem('hasLaunched', 'true');
      setAppState('intro');
      bootstrapped.current = true;
      return;
    }

    setAppState(restored.token ? 'app' : 'auth');
    bootstrapped.current = true;
  };

  // React when token changes (after login/logout)
useEffect(() => {
  if (!bootstrapped.current) return;
  if (appState === 'intro') return; // the intro owns the screen until finished
  if (state.userToken) {
    setAppState('app');
  } else {
    setAppState('auth');
  }
}, [state.userToken]);

  if (appState === 'loading') return null;

  return (
    <NavigationContainer ref={navigationRef} onReady={openPatientsForPendingAlert} onStateChange={openPatientsForPendingAlert}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {appState === 'intro' && (
          <Stack.Screen name="Intro">
            {(props) => (
              <IntroScreen
                {...props}
                onFinish={() => setAppState('auth')}
              />
            )}
          </Stack.Screen>
        )}

        {appState === 'auth' && (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}

        {appState === 'app' && (
          <Stack.Screen name="App" component={AppNavigator} />
        )}

      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
      <BoundaryAlertOverlay />
    </AuthProvider>
  );
}
