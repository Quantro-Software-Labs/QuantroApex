'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      // Firebase auth error codes → human readable
      const authErr = err as { code?: string; message?: string };
      const code = authErr?.code ?? '';
      const msg = authErr?.message ?? '';
      if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) {
        setError('Incorrect email or password.');
      } else if (code.includes('too-many-requests')) {
        setError('Too many attempts. Please wait a moment and try again.');
      } else {
        setError(msg || 'Sign in failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-apex-bg px-4">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-apex-accent/5 blur-[120px]" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/quantro_logo.jpeg"
              alt="Quantro Logo"
              className="h-12 w-12 rounded-2xl object-cover shadow-lg shadow-apex-accent/20 ring-1 ring-apex-border group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col text-left leading-none">
              <h1 className="text-2xl font-extrabold text-apex-text tracking-tight">QuantroApex</h1>
              <p className="text-[10px] font-bold uppercase tracking-wider text-apex-accent mt-1">
                Quantro Software Labs
              </p>
            </div>
          </Link>
          <p className="text-sm text-apex-muted mt-1">Sign in to your account</p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-apex-border bg-apex-surface p-6 shadow-2xl shadow-black/30"
        >
          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg border border-apex-danger/20 bg-apex-danger/10 px-4 py-3 text-sm text-apex-danger">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-apex-muted uppercase tracking-wider">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-sm text-apex-text placeholder:text-apex-muted/50 outline-none transition-all duration-150 focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30"
              />
            </div>

            {/* Password */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium text-apex-muted uppercase tracking-wider">
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-apex-accent hover:text-apex-accent/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 pr-11 text-sm text-apex-text placeholder:text-apex-muted/50 outline-none transition-all duration-150 focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-apex-muted hover:text-apex-text transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <button
            id="sign-in-btn"
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-apex-accent py-3 text-sm font-semibold text-white shadow-lg shadow-apex-accent/20 transition-all duration-150 hover:bg-apex-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="mt-5 text-center text-sm text-apex-muted">
            Don&apos;t have an account?{' '}
            <Link
              href="/auth/signup"
              className="font-medium text-apex-accent hover:text-apex-accent/80 transition-colors"
            >
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
