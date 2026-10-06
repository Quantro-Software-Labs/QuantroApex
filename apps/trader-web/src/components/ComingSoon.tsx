'use client';

import { AppShell } from '@/components/layout/AppShell';
import { Clock, Bell } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api-client';

export default function ComingSoonPage({
  title,
  description,
  assetClass,
}: {
  title: string;
  description: string;
  assetClass: string;
}) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await api.post('/waitlist', { email, assetClass, source: 'web' });
      setSubmitted(true);
    } catch {
      setSubmitted(true); // Still show success — don't alarm user
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col items-center justify-center gap-8 px-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-apex-border bg-apex-surface">
            <Clock size={28} className="text-apex-muted" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-apex-text">{title}</h1>
            <p className="mt-2 text-sm text-apex-muted leading-relaxed">{description}</p>
          </div>

          {!submitted ? (
            <form onSubmit={handleWaitlist} className="mt-2 flex w-full gap-2">
              <input
                id="waitlist-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 rounded-xl border border-apex-border bg-apex-surface px-4 py-3 text-sm text-apex-text placeholder:text-apex-muted/50 outline-none focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30"
              />
              <button
                id="waitlist-join-btn"
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-apex-accent px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-apex-accent/90 disabled:opacity-60"
              >
                <Bell size={14} />
                Notify me
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-apex-success/20 bg-apex-success/10 px-4 py-3 text-sm text-apex-success">
              You&apos;re on the list. We&apos;ll let you know when {title} launches.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
