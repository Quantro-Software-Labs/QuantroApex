import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDummyKeyForBuildTime1234567',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'quantro-apex.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'quantro-apex',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'quantro-apex.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '100000000000',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:100000000000:web:abcdef1234567890',
};

// Singleton — Next.js hot reload / SSR safe
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

let authInstance: Auth;
try {
  authInstance = getAuth(app);
} catch {
  // Graceful fallback for SSG build time / unit tests when Firebase API key is unconfigured
  authInstance = {} as Auth;
}

export const auth: Auth = authInstance;
export default app;
