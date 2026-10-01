import { getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
// Firebase's React Native runtime exports this, but some generic TypeScript declarations omit it.
// @ts-ignore React Native-only Firebase export
import { getReactNativePersistence } from 'firebase/auth';
import { Database, getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.databaseURL && config.projectId && config.appId
);

const app = isFirebaseConfigured
  ? getApps().length ? getApp() : initializeApp(config)
  : null;

function createAuth(): Auth | null {
  if (!app) return null;
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error: any) {
    // Fast Refresh can initialize Firebase multiple times in development.
    if (error?.code === 'auth/already-initialized') return getAuth(app);
    throw error;
  }
}

export const auth = createAuth();
export const db: Database | null = app ? getDatabase(app) : null;
