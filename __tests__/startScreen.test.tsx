/**
 * Start-screen routing evidence: which screen a user lands on when the app
 * opens, per saved-session state. Navigators and Intro are mocked to marker
 * components so the assertions are about the routing decision itself.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: any) => children,
}));
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ children, component: Component, ...rest }: any) =>
      typeof children === 'function'
        ? children(rest)
        : children ?? (Component ? <Component {...rest} /> : null),
  }),
}));
jest.mock('../Src/Services/locationNative', () => ({
  startPushListeners: () => () => {},
  locationSession: { setOwner: async () => {} },
  batteryReporter: { setOwner: () => {} },
}));
jest.mock('../Src/Navigation/navigationRef', () => ({
  navigationRef: {},
  openPatientsForPendingAlert: () => {},
}));
jest.mock('../Src/Navigation/AppNavigator', () => () => {
  const { Text: T } = require('react-native');
  return <T>APP_NAV</T>;
});
jest.mock('../Src/Navigation/AuthNavigator', () => () => {
  const { Text: T } = require('react-native');
  return <T>AUTH_NAV</T>;
});
jest.mock('../Src/Screens/IntroScreen', () => ({ onFinish }: any) => {
  const { Text: T } = require('react-native');
  return <T onPress={onFinish}>INTRO</T>;
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

const getItem = AsyncStorage.getItem as jest.Mock;
const realGetItem = getItem.getMockImplementation()!;

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(t => String(t.props.children));
}

async function renderAndSettle(settleMs = 100) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(r => setTimeout(r, settleMs));
  });
  return tree;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  getItem.mockImplementation(realGetItem);
});

test('returning user with a saved session lands on the app, not the login screen', async () => {
  await AsyncStorage.setItem('hasLaunched', 'true');
  await AsyncStorage.setItem('userToken', 'tok-saved');
  await AsyncStorage.setItem('user', '{"id":"u1","role":"patient"}');
  const tree = await renderAndSettle();
  expect(texts(tree)).toContain('APP_NAV');
  expect(texts(tree)).not.toContain('AUTH_NAV');
});

test('returning user with no saved session lands on the login screen', async () => {
  await AsyncStorage.setItem('hasLaunched', 'true');
  const tree = await renderAndSettle();
  expect(texts(tree)).toContain('AUTH_NAV');
  expect(texts(tree)).not.toContain('APP_NAV');
});

test('a slow storage restore (> 3 s) still lands on the app when a session is saved', async () => {
  await AsyncStorage.setItem('hasLaunched', 'true');
  await AsyncStorage.setItem('userToken', 'tok-saved');
  await AsyncStorage.setItem('user', '{"id":"u1","role":"patient"}');
  getItem.mockImplementation(
    (key: string, ...rest: any[]) =>
      new Promise(resolve => setTimeout(() => resolve(realGetItem(key, ...rest)), 3200)),
  );
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  // While the restore is still pending nothing is shown - crucially NOT the
  // login screen.
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(r => setTimeout(r, 500));
  });
  expect(texts(tree)).not.toContain('AUTH_NAV');
  expect(texts(tree)).not.toContain('APP_NAV');
  // Once storage answers (every read is delayed, sequentially), the saved
  // session wins.
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(r => setTimeout(r, 11000));
  });
  expect(texts(tree)).toContain('APP_NAV');
  expect(texts(tree)).not.toContain('AUTH_NAV');
}, 15000);

test('first launch shows the intro, then the login screen after finishing it', async () => {
  const tree = await renderAndSettle();
  expect(texts(tree)).toContain('INTRO');
  const intro = tree.root.findAllByType(Text).find(t => t.props.children === 'INTRO');
  await ReactTestRenderer.act(async () => {
    intro!.props.onPress();
  });
  expect(texts(tree)).toContain('AUTH_NAV');
  expect(texts(tree)).not.toContain('APP_NAV');
});

