'use client';

import { AppShell } from '@/components/layout/AppShell';
import { useMe, useUpdateProfile } from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { Loader2, User, Shield, Bell, CreditCard, Key } from 'lucide-react';
import { cn } from '@/lib/utils';

type SettingsTab = 'account' | 'broker' | 'risk' | 'notifications' | 'subscription';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const { data: profile } = useMe();
  const updateProfile = useUpdateProfile();
  const { user } = useAuth();

  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [experienceLevel, setExperienceLevel] = useState<'NEWCOMER' | 'INTERMEDIATE' | 'PROFESSIONAL'>(
    (profile?.experienceLevel as any) ?? 'INTERMEDIATE'
  );
  const [brokerKey, setBrokerKey] = useState(profile?.profile?.alpacaApiKey ?? '');
  const [brokerSecret, setBrokerSecret] = useState(profile?.profile?.alpacaSecretKey ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'broker', label: 'Broker Keys', icon: Key },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'subscription', label: 'Subscription', icon: CreditCard },
  ];

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile.mutateAsync({ firstName, lastName, experienceLevel });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-apex-text">Settings</h1>
          <p className="mt-0.5 text-sm text-apex-muted">Manage your account, risk parameters, and preferences</p>
        </div>

        <div className="flex gap-6">
          {/* Sidebar tabs */}
          <div className="flex w-44 shrink-0 flex-col gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  id={`settings-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-left transition-all',
                    activeTab === tab.id
                      ? 'bg-apex-accent/10 text-apex-accent'
                      : 'text-apex-muted hover:bg-apex-hover hover:text-apex-text',
                  )}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 rounded-2xl border border-apex-border bg-apex-surface p-6">
            {activeTab === 'account' && (
              <div className="space-y-5">
                <h2 className="text-sm font-semibold text-apex-text">Account Information</h2>

                <form onSubmit={handleSaveAccount} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-apex-muted">
                        First Name
                      </label>
                      <input
                        id="settings-first-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-sm text-apex-text outline-none focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-apex-muted">
                        Last Name
                      </label>
                      <input
                        id="settings-last-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-sm text-apex-text outline-none focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-apex-muted">
                      Email
                    </label>
                    <input
                      disabled
                      value={user?.email ?? ''}
                      className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-sm text-apex-muted cursor-not-allowed opacity-60"
                    />
                    <p className="mt-1 text-xs text-apex-muted">Email is managed by Firebase Auth</p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-apex-muted">
                      Experience Level
                    </label>
                    <select
                      id="settings-experience-level"
                      value={experienceLevel}
                      onChange={(e) => setExperienceLevel(e.target.value as any)}
                      className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-sm text-apex-text outline-none focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30 cursor-pointer"
                    >
                      <option value="NEWCOMER">NEWCOMER (New to trading)</option>
                      <option value="INTERMEDIATE">INTERMEDIATE (Familiar with technicals)</option>
                      <option value="PROFESSIONAL">PROFESSIONAL (Quantitative trader)</option>
                    </select>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-apex-muted">Tailors AI explanations & risk parameters</p>
                      <a href="/onboarding" className="text-xs text-apex-accent hover:underline font-semibold">
                        Re-run Onboarding Setup &rarr;
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      id="settings-save-btn"
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 rounded-xl bg-apex-accent px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-apex-accent/90 disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    {saved && (
                      <span className="text-sm text-apex-success">Changes saved.</span>
                    )}
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'broker' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-apex-text">Broker API Credentials</h2>
                  <p className="mt-1 text-xs text-apex-muted leading-relaxed">
                    Connect your API keys from Alpaca (Stocks) to enable live real-capital execution under the SCOPED_EDGE policy. (Crypto & Forex broker connections coming soon).
                  </p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSaving(true);
                    try {
                      await updateProfile.mutateAsync({
                        profile: {
                          globalBrainConsent: true,
                          isBrokerConnected: Boolean(brokerKey.trim()),
                          alpacaApiKey: brokerKey.trim(),
                          alpacaSecretKey: brokerSecret.trim(),
                        },
                      } as any);
                      setSaved(true);
                      setTimeout(() => setSaved(false), 3000);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-apex-muted">
                      Alpaca API Key
                    </label>
                    <input
                      value={brokerKey}
                      onChange={(e) => setBrokerKey(e.target.value)}
                      placeholder="e.g. PK2U6432ALU7PXWOR4G..."
                      className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-xs font-mono text-apex-text outline-none focus:border-apex-accent"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-apex-muted">
                      Alpaca Secret Key
                    </label>
                    <input
                      type="password"
                      value={brokerSecret}
                      onChange={(e) => setBrokerSecret(e.target.value)}
                      placeholder="••••••••••••••••••••••••••••••••"
                      className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-xs font-mono text-apex-text outline-none focus:border-apex-accent"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 rounded-xl bg-apex-accent px-5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-apex-accent/90 disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                      {saving ? 'Saving…' : 'Save Broker Credentials'}
                    </button>
                    {saved && <span className="text-xs text-apex-success">Broker keys updated.</span>}
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'risk' && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-apex-text">Risk Vault</h2>
                <p className="text-sm text-apex-muted leading-relaxed">
                  Risk Vault settings control how Apex manages your capital. These settings are enforced server-side on every trade.
                </p>
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-apex-border">
                  <p className="text-sm text-apex-muted">Risk Vault UI — Risk Vault sprint</p>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-apex-text">Notification Preferences</h2>
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-apex-border">
                  <p className="text-sm text-apex-muted">Notification settings — Notifications sprint</p>
                </div>
              </div>
            )}

            {activeTab === 'subscription' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between rounded-xl border border-apex-border bg-apex-surface/60 p-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-apex-accent">Active Subscription</p>
                    <p className="mt-1 text-2xl font-extrabold text-apex-text">
                      {profile?.subscription?.plan ?? 'Observer (Free)'}
                    </p>
                    <p className="text-xs text-apex-muted mt-0.5">
                      Status: <span className="font-semibold text-apex-success">Active</span> • Renewal: Auto-renews monthly
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-apex-success animate-pulse" />
                    <span className="text-xs font-bold uppercase text-apex-success">Active Plan</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-apex-text">Available Subscription Tiers</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Observer */}
                    <div className="rounded-xl border border-apex-border p-4 space-y-3 bg-apex-surface/40">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-apex-text">Observer</p>
                          <p className="text-lg font-extrabold text-apex-text">Free</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-apex-hover text-apex-muted">Current</span>
                      </div>
                      <ul className="text-xs text-apex-muted space-y-1">
                        <li>• Simulation trading</li>
                        <li>• Advisory signals</li>
                        <li>• Marketplace browse</li>
                      </ul>
                    </div>

                    {/* Core */}
                    <div className="rounded-xl border border-apex-border p-4 space-y-3 bg-apex-surface/40 hover:border-apex-accent/40 transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-apex-text">Core</p>
                          <p className="text-lg font-extrabold text-apex-text">₦29,000 <span className="text-xs font-normal text-apex-muted">/mo</span></p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-apex-accent/10 text-apex-accent">Popular</span>
                      </div>
                      <ul className="text-xs text-apex-muted space-y-1">
                        <li>• Autopilot execution</li>
                        <li>• Risk Vault enforcement</li>
                        <li>• Real-time push alerts</li>
                      </ul>
                      <button className="w-full py-1.5 text-xs font-semibold rounded-lg bg-apex-accent text-white hover:bg-blue-600 transition-colors">Upgrade to Core</button>
                    </div>

                    {/* Pro */}
                    <div className="rounded-xl border border-apex-accent p-4 space-y-3 bg-apex-surface/60 relative">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-apex-text">Pro</p>
                          <p className="text-lg font-extrabold text-apex-text">₦79,000 <span className="text-xs font-normal text-apex-muted">/mo</span></p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-apex-accent text-white">Recommended</span>
                      </div>
                      <ul className="text-xs text-apex-muted space-y-1">
                        <li>• Manual trading desk</li>
                        <li>• SMC analysis tools</li>
                        <li>• Priority support</li>
                      </ul>
                      <button className="w-full py-1.5 text-xs font-semibold rounded-lg bg-apex-accent text-white hover:bg-blue-600 transition-colors">Upgrade to Pro</button>
                    </div>

                    {/* Elite */}
                    <div className="rounded-xl border border-apex-border p-4 space-y-3 bg-apex-surface/40 hover:border-purple-500/40 transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-apex-text">Elite</p>
                          <p className="text-lg font-extrabold text-apex-text">₦199,000 <span className="text-xs font-normal text-apex-muted">/mo</span></p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400">Institutional</span>
                      </div>
                      <ul className="text-xs text-apex-muted space-y-1">
                        <li>• Unlimited capital allocation</li>
                        <li>• Global Brain V2 access</li>
                        <li>• Dedicated quant onboarding</li>
                      </ul>
                      <button className="w-full py-1.5 text-xs font-semibold rounded-lg border border-apex-border bg-apex-hover text-apex-text hover:border-purple-500/40 transition-colors">Upgrade to Elite</button>
                    </div>

                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
