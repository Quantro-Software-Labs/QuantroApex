'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Wraps any layout/page that requires authentication.
 * Redirects to /auth/login if no Firebase user is found.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-apex-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-apex-surface border-t-apex-accent" />
          <span className="text-sm text-apex-muted font-medium">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
