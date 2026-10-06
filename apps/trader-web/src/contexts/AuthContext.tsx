'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

interface AuthContextValue {
  user: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  loginAsDemo: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function createMockUser(email: string, name?: string): FirebaseUser {
  return {
    uid: 'demo-user-' + Math.random().toString(36).substring(2, 9),
    email,
    displayName: name || email.split('@')[0] || 'Quantro Trader',
    emailVerified: true,
    getIdToken: async () => 'demo-bearer-token-123',
  } as unknown as FirebaseUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if demo user session exists in localStorage
    if (typeof window !== 'undefined') {
      const savedDemo = localStorage.getItem('quantro_demo_user');
      if (savedDemo) {
        try {
          const parsed = JSON.parse(savedDemo);
          setTimeout(() => {
            setUser({
              uid: parsed.uid,
              email: parsed.email,
              displayName: parsed.displayName,
              emailVerified: true,
              getIdToken: async () => 'demo-token-123',
            } as unknown as FirebaseUser);
            setLoading(false);
          }, 0);
          return;
        } catch {
          // ignore
        }
      }
    }

    if (!auth || typeof auth.onIdTokenChanged !== 'function') {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    try {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          setUser(firebaseUser);
        }
        setLoading(false);
      });
      return unsubscribe;
    } catch {
      setTimeout(() => setLoading(false), 0);
    }
  }, []);

  function loginAsDemo() {
    const mock = createMockUser('trader@quantrolabs.app', 'Quantro Trader');
    setUser(mock);
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'quantro_demo_user',
        JSON.stringify({ uid: mock.uid, email: mock.email, displayName: mock.displayName })
      );
    }
    router.push('/home');
  }

  async function signIn(email: string, password: string) {
    const hasValidKey =
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      !process.env.NEXT_PUBLIC_FIREBASE_API_KEY.includes('DummyKey');

    if (!hasValidKey) {
      // Dev mode fallback when Firebase keys are unconfigured
      const mock = createMockUser(email);
      setUser(mock);
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          'quantro_demo_user',
          JSON.stringify({ uid: mock.uid, email: mock.email, displayName: mock.displayName })
        );
      }
      router.push('/home');
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/home');
    } catch (err: unknown) {
      const authErr = err as { code?: string };
      if (authErr?.code === 'auth/invalid-api-key') {
        const mock = createMockUser(email);
        setUser(mock);
        if (typeof window !== 'undefined') {
          localStorage.setItem(
            'quantro_demo_user',
            JSON.stringify({ uid: mock.uid, email: mock.email, displayName: mock.displayName })
          );
        }
        router.push('/home');
        return;
      }
      throw err;
    }
  }

  async function signUp(email: string, password: string, name: string) {
    const hasValidKey =
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      !process.env.NEXT_PUBLIC_FIREBASE_API_KEY.includes('DummyKey');

    if (!hasValidKey) {
      // Dev mode fallback when Firebase keys are unconfigured
      const mock = createMockUser(email, name);
      setUser(mock);
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          'quantro_demo_user',
          JSON.stringify({ uid: mock.uid, email: mock.email, displayName: mock.displayName })
        );
      }
      router.push('/home');
      return;
    }

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      router.push('/home');
    } catch (err: unknown) {
      const authErr = err as { code?: string };
      if (authErr?.code === 'auth/invalid-api-key') {
        const mock = createMockUser(email, name);
        setUser(mock);
        if (typeof window !== 'undefined') {
          localStorage.setItem(
            'quantro_demo_user',
            JSON.stringify({ uid: mock.uid, email: mock.email, displayName: mock.displayName })
          );
        }
        router.push('/home');
        return;
      }
      throw err;
    }
  }

  async function logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('quantro_demo_user');
    }
    setUser(null);
    if (auth && typeof auth.onIdTokenChanged === 'function') {
      try {
        await signOut(auth);
      } catch {
        // ignore
      }
    }
    router.push('/auth/login');
  }

  async function resetPassword(email: string) {
    if (auth && typeof auth.onIdTokenChanged === 'function') {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch {
        // Fallback for dev mode
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, logout, resetPassword, loginAsDemo }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
