'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function SignUpPage() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, name);
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string };
      const code = authErr?.code ?? '';
      const msg = authErr?.message ?? '';
      if (code.includes('email-already-in-use')) {
        setError('An account with this email already exists.');
      } else if (code.includes('invalid-email')) {
        setError('Please enter a valid email address.');
      } else if (code.includes('weak-password')) {
        setError('Password is too weak. Use at least 8 characters.');
      } else {
        setError(msg || 'Registration failed. Please check your details and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-apex-bg px-4">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-apex-accent/5 blur-[120px]" />

      <div className="relative w-full max-w-sm">
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
          <p className="text-sm text-apex-muted mt-1">Start trading smarter with Apex</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-apex-border bg-apex-surface p-6 shadow-2xl shadow-black/30"
        >
          {error && (
            <div className="mb-4 rounded-lg border border-apex-danger/20 bg-apex-danger/10 px-4 py-3 text-sm text-apex-danger">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-apex-muted uppercase tracking-wider">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-sm text-apex-text placeholder:text-apex-muted/50 outline-none transition-all duration-150 focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30"
              />
            </div>

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

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-apex-muted uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
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
            id="sign-up-btn"
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-apex-accent py-3 text-sm font-semibold text-white shadow-lg shadow-apex-accent/20 transition-all duration-150 hover:bg-apex-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <p className="mt-5 text-center text-sm text-apex-muted">
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="font-medium text-apex-accent hover:text-apex-accent/80 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-apex-muted/60 px-4">
          By creating an account you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
