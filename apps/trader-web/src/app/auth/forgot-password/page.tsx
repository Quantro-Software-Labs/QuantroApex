'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: unknown) {
      const authErr = err as { code?: string };
      const code = authErr?.code ?? '';
      if (code.includes('user-not-found')) {
        // Don't confirm whether email exists — security best practice
        setSent(true);
      } else {
        setError('Something went wrong. Please try again.');
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
          <p className="text-sm text-apex-muted mt-1">Enter your email to receive a password reset link</p>
        </div>

        <div className="rounded-2xl border border-apex-border bg-apex-surface p-6 shadow-2xl shadow-black/30">
          {sent ? (
            <div className="text-center space-y-4 py-2">
              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full border border-apex-success/20 bg-apex-success/10">
                <span className="text-apex-success text-xl">✓</span>
              </div>
              <p className="text-sm text-apex-muted leading-relaxed">
                If an account exists for <span className="font-medium text-apex-text">{email}</span>, you&apos;ll receive a password reset email shortly.
              </p>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 text-sm text-apex-accent hover:text-apex-accent/80 transition-colors"
              >
                <ArrowLeft size={14} />
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-apex-danger/20 bg-apex-danger/10 px-4 py-3 text-sm text-apex-danger">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="reset-email" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-apex-muted">
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-sm text-apex-text placeholder:text-apex-muted/50 outline-none transition-all duration-150 focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30"
                />
              </div>

              <button
                id="reset-submit-btn"
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-apex-accent py-3 text-sm font-semibold text-white shadow-lg shadow-apex-accent/20 transition-all hover:bg-apex-accent/90 disabled:opacity-60"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Sending…' : 'Send reset link'}
              </button>

              <Link
                href="/auth/login"
                className="flex items-center justify-center gap-2 text-sm text-apex-muted hover:text-apex-text transition-colors"
              >
                <ArrowLeft size={14} />
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
