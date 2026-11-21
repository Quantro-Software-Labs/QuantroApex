'use client';

import { AppShell } from '@/components/layout/AppShell';
import {
  useMe,
  useUpdateProfile,
  useRiskVault,
  useUpdateRiskVault,
  useInitialiseSubscription,
  useResumeTrading,
  ExperienceLevel,
  UpdateProfileInput,
  RiskVaultData,
} from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import {
  Loader2,
  User,
  Shield,
  Bell,
  CreditCard,
  Key,
  AlertOctagon,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type SettingsTab = 'account' | 'broker' | 'risk' | 'notifications' | 'subscription';

interface RiskVaultFormProps {
  initialVault?: RiskVaultData;
  onSave: (data: {
    dailyLossLimit: number;
    dailyLossLimitUnit: 'PERCENT' | 'USD';
    maxDrawdown: number;
    maxDrawdownUnit: 'PERCENT' | 'USD';
    perTradeExposure: number;
    perTradeExposureUnit: 'PERCENT' | 'USD';
  }) => Promise<void>;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

function RiskVaultForm({ initialVault, onSave, saving, saved, error }: RiskVaultFormProps) {
  const initialDaily =
    initialVault?.dailyLossLimit != null && !isNaN(Number(initialVault.dailyLossLimit))
      ? initialVault.dailyLossLimitUnit === 'PERCENT'
        ? String(Math.round(initialVault.dailyLossLimit * 100))
        : String(initialVault.dailyLossLimit)
      : '5';

  const initialDrawdown =
    initialVault?.maxDrawdown != null && !isNaN(Number(initialVault.maxDrawdown))
      ? initialVault.maxDrawdownUnit === 'PERCENT'
        ? String(Math.round(initialVault.maxDrawdown * 100))
        : String(initialVault.maxDrawdown)
      : '10';

  const initialExposure =
    initialVault?.perTradeExposure != null && !isNaN(Number(initialVault.perTradeExposure))
      ? initialVault.perTradeExposureUnit === 'PERCENT'
        ? String(Math.round(initialVault.perTradeExposure * 100))
        : String(initialVault.perTradeExposure)
      : '5';

  const [dailyLossLimit, setDailyLossLimit] = useState(initialDaily);
  const [dailyLossLimitUnit, setDailyLossLimitUnit] = useState<'PERCENT' | 'USD'>(
    initialVault?.dailyLossLimitUnit ?? 'PERCENT',
  );
  const [maxDrawdown, setMaxDrawdown] = useState(initialDrawdown);
  const [maxDrawdownUnit, setMaxDrawdownUnit] = useState<'PERCENT' | 'USD'>(
    initialVault?.maxDrawdownUnit ?? 'PERCENT',
  );
  const [perTradeExposure, setPerTradeExposure] = useState(initialExposure);
  const [perTradeExposureUnit, setPerTradeExposureUnit] = useState<'PERCENT' | 'USD'>(
    initialVault?.perTradeExposureUnit ?? 'PERCENT',
  );

  const [formValidation, setFormValidation] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormValidation(null);

    const rawDaily = Number(dailyLossLimit);
    const rawDrawdown = Number(maxDrawdown);
    const rawExposure = Number(perTradeExposure);

    if (isNaN(rawDaily) || rawDaily <= 0) {
      setFormValidation('Daily loss limit must be greater than 0.');
      return;
    }
    if (isNaN(rawDrawdown) || rawDrawdown <= 0) {
      setFormValidation('Max drawdown must be greater than 0.');
      return;
    }
    if (isNaN(rawExposure) || rawExposure <= 0) {
      setFormValidation('Per-trade exposure must be greater than 0.');
      return;
    }

    const finalDaily = dailyLossLimitUnit === 'PERCENT' ? rawDaily / 100 : rawDaily;
    const finalDrawdown = maxDrawdownUnit === 'PERCENT' ? rawDrawdown / 100 : rawDrawdown;
    const finalExposure = perTradeExposureUnit === 'PERCENT' ? rawExposure / 100 : rawExposure;

    if (dailyLossLimitUnit === 'PERCENT' && (finalDaily <= 0 || finalDaily > 1)) {
      setFormValidation('Percentage daily loss limit must be between 1% and 100%.');
      return;
    }

    await onSave({
      dailyLossLimit: finalDaily,
      dailyLossLimitUnit,
      maxDrawdown: finalDrawdown,
      maxDrawdownUnit,
      perTradeExposure: finalExposure,
      perTradeExposureUnit,
    });
  }

  const activeError = formValidation ?? error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Daily Loss Limit */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-apex-muted">
          Daily Loss Limit
        </label>
        <div className="flex gap-2">
          <input
            id="risk-daily-loss-limit"
            type="number"
            step="any"
            value={dailyLossLimit}
            onChange={(e) => setDailyLossLimit(e.target.value)}
            className="flex-1 rounded-xl border border-apex-border bg-apex-bg px-4 py-2.5 text-xs font-mono text-apex-text outline-none focus:border-apex-accent"
          />
          <select
            id="risk-daily-loss-unit"
            value={dailyLossLimitUnit}
            onChange={(e) => setDailyLossLimitUnit(e.target.value as 'PERCENT' | 'USD')}
            className="rounded-xl border border-apex-border bg-apex-bg px-3 py-2 text-xs font-semibold text-apex-text outline-none focus:border-apex-accent cursor-pointer"
          >
            <option value="PERCENT">PERCENT (%)</option>
            <option value="USD">USD ($)</option>
          </select>
        </div>
        <p className="mt-1 text-[11px] text-apex-muted">
          {dailyLossLimitUnit === 'PERCENT'
            ? 'Percentage of portfolio equity (e.g. 5 for 5%)'
            : 'Fixed dollar limit (e.g. 500 for $500)'}
        </p>
      </div>

      {/* Max Drawdown */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-apex-muted">
          Max Peak-to-Trough Drawdown
        </label>
        <div className="flex gap-2">
          <input
            id="risk-max-drawdown"
            type="number"
            step="any"
            value={maxDrawdown}
            onChange={(e) => setMaxDrawdown(e.target.value)}
            className="flex-1 rounded-xl border border-apex-border bg-apex-bg px-4 py-2.5 text-xs font-mono text-apex-text outline-none focus:border-apex-accent"
          />
          <select
            id="risk-max-drawdown-unit"
            value={maxDrawdownUnit}
            onChange={(e) => setMaxDrawdownUnit(e.target.value as 'PERCENT' | 'USD')}
            className="rounded-xl border border-apex-border bg-apex-bg px-3 py-2 text-xs font-semibold text-apex-text outline-none focus:border-apex-accent cursor-pointer"
          >
            <option value="PERCENT">PERCENT (%)</option>
            <option value="USD">USD ($)</option>
          </select>
        </div>
      </div>

      {/* Per Trade Exposure */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-apex-muted">
          Per-Trade Max Exposure
        </label>
        <div className="flex gap-2">
          <input
            id="risk-per-trade-exposure"
            type="number"
            step="any"
            value={perTradeExposure}
            onChange={(e) => setPerTradeExposure(e.target.value)}
            className="flex-1 rounded-xl border border-apex-border bg-apex-bg px-4 py-2.5 text-xs font-mono text-apex-text outline-none focus:border-apex-accent"
          />
          <select
            id="risk-per-trade-unit"
            value={perTradeExposureUnit}
            onChange={(e) => setPerTradeExposureUnit(e.target.value as 'PERCENT' | 'USD')}
            className="rounded-xl border border-apex-border bg-apex-bg px-3 py-2 text-xs font-semibold text-apex-text outline-none focus:border-apex-accent cursor-pointer"
          >
            <option value="PERCENT">PERCENT (%)</option>
            <option value="USD">USD ($)</option>
          </select>
        </div>
      </div>

      {activeError && (
        <p className="text-xs font-medium text-apex-danger">{activeError}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          id="save-risk-vault-btn"
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-apex-accent px-5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-apex-accent/90 disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {saving ? 'Saving…' : 'Save Risk Vault Limits'}
        </button>
        {saved && (
          <span className="text-xs text-apex-success">Risk Vault parameters updated.</span>
        )}
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const { data: profile } = useMe();
  const updateProfile = useUpdateProfile();
  const { user } = useAuth();

  // Account State
  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    profile?.experienceLevel ?? 'INTERMEDIATE',
  );

  // Broker State
  const [brokerKey, setBrokerKey] = useState(profile?.profile?.alpacaApiKey ?? '');
  const [brokerSecret, setBrokerSecret] = useState(profile?.profile?.alpacaSecretKey ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Risk Vault State
  const { data: riskVault } = useRiskVault('STOCKS');
  const updateRiskVault = useUpdateRiskVault('STOCKS');
  const resumeTrading = useResumeTrading('STOCKS');

  const [riskSaving, setRiskSaving] = useState(false);
  const [riskSaved, setRiskSaved] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  // Subscription state
  const initialiseSub = useInitialiseSubscription();
  const [subLoading, setSubLoading] = useState<string | null>(null);
  const [subError, setSubError] = useState<string | null>(null);

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'broker', label: 'Broker Keys', icon: Key },
    { id: 'risk', label: 'Risk Vault', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'subscription', label: 'Subscription', icon: CreditCard },
  ];

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const payload: UpdateProfileInput = { firstName, lastName, experienceLevel };
      await updateProfile.mutateAsync(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRiskVault(data: {
    dailyLossLimit: number;
    dailyLossLimitUnit: 'PERCENT' | 'USD';
    maxDrawdown: number;
    maxDrawdownUnit: 'PERCENT' | 'USD';
    perTradeExposure: number;
    perTradeExposureUnit: 'PERCENT' | 'USD';
  }) {
    setRiskSaving(true);
    setRiskSaved(false);
    setRiskError(null);

    try {
      await updateRiskVault.mutateAsync(data);
      setRiskSaved(true);
      setTimeout(() => setRiskSaved(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRiskError(msg || 'Failed to update Risk Vault.');
    } finally {
      setRiskSaving(false);
    }
  }

  async function handleUpgrade(plan: 'CORE' | 'PRO' | 'ELITE') {
    setSubLoading(plan);
    setSubError(null);
    try {
      const res = await initialiseSub.mutateAsync({ plan });
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubError(msg || 'Failed to initialize subscription checkout.');
    } finally {
      setSubLoading(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-apex-text">Settings</h1>
          <p className="mt-0.5 text-sm text-apex-muted">Manage your account, Risk Vault parameters, and preferences</p>
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
                      onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
                      className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-sm text-apex-text outline-none focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30 cursor-pointer"
                    >
                      <option value="NEWCOMER">NEWCOMER (New to trading)</option>
                      <option value="INTERMEDIATE">INTERMEDIATE (Familiar with technicals)</option>
                      <option value="PROFESSIONAL">PROFESSIONAL (Quantitative trader)</option>
                    </select>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-apex-muted">Tailors AI explanations &amp; risk parameters</p>
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
                    Connect your API keys from Alpaca (Stocks) to enable live real-capital execution under the SCOPED_EDGE policy.
                  </p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSaving(true);
                    try {
                      const payload: UpdateProfileInput = {
                        profile: {
                          globalBrainConsent: true,
                          isBrokerConnected: Boolean(brokerKey.trim()),
                          alpacaApiKey: brokerKey.trim(),
                          alpacaSecretKey: brokerSecret.trim(),
                        },
                      };
                      await updateProfile.mutateAsync(payload);
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
                      id="broker-api-key"
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
                      id="broker-secret-key"
                      type="password"
                      value={brokerSecret}
                      onChange={(e) => setBrokerSecret(e.target.value)}
                      placeholder="••••••••••••••••••••••••••••••••"
                      className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-xs font-mono text-apex-text outline-none focus:border-apex-accent"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      id="save-broker-keys-btn"
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
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-apex-text">Risk Vault Enforcement</h2>
                  <p className="mt-1 text-xs text-apex-muted leading-relaxed">
                    Hard risk limits enforced server-side inside transactional database locks before any order reaches the broker.
                  </p>
                </div>

                {/* Plain-English Daily Loss Basis explanation */}
                <div className="rounded-xl border border-apex-border bg-apex-bg/60 p-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-apex-accent" />
                    <span className="text-xs font-bold uppercase tracking-wider text-apex-text">
                      Daily Loss Calculation Basis
                    </span>
                  </div>
                  <p className="text-xs text-apex-muted leading-relaxed">
                    {riskVault?.dailyLossBasisExplanation ??
                      "Losses today count in full. Gains earlier in the day don't widen your limit."}
                  </p>
                </div>

                {/* Emergency Stop status pill */}
                {riskVault?.emergencyStop && (
                  <div className="flex items-center justify-between rounded-xl border border-apex-danger/40 bg-apex-danger/10 p-3.5">
                    <div className="flex items-center gap-2.5">
                      <AlertOctagon size={16} className="text-apex-danger" />
                      <div>
                        <p className="text-xs font-bold text-apex-danger">Emergency Stop is Active</p>
                        <p className="text-[11px] text-apex-muted">Trading execution is suspended.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => resumeTrading.mutate()}
                      disabled={(riskVault.queuedClosesCount ?? 0) > 0 || resumeTrading.isPending}
                      className="flex items-center gap-1.5 rounded-lg border border-apex-border bg-apex-surface px-3 py-1 text-xs font-semibold text-apex-text hover:bg-apex-hover disabled:opacity-40"
                    >
                      <RefreshCw size={12} className={cn(resumeTrading.isPending && 'animate-spin')} />
                      <span>Reset</span>
                    </button>
                  </div>
                )}

                <RiskVaultForm
                  key={riskVault ? `${riskVault.id}-${riskVault.dailyLossLimit}-${riskVault.maxDrawdown}` : 'loading'}
                  initialVault={riskVault}
                  onSave={handleSaveRiskVault}
                  saving={riskSaving}
                  saved={riskSaved}
                  error={riskError}
                />
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
                      {profile?.subscription?.plan ?? 'OBSERVER'}
                    </p>
                    <p className="text-xs text-apex-muted mt-0.5">
                      Status: <span className="font-semibold text-apex-success">Active</span> • Server-enforced billing
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-apex-success animate-pulse" />
                    <span className="text-xs font-bold uppercase text-apex-success">Active Plan</span>
                  </div>
                </div>

                {subError && (
                  <p className="text-xs font-medium text-apex-danger">{subError}</p>
                )}

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-apex-text">Available Subscription Tiers</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Observer */}
                    <div className="rounded-xl border border-apex-border p-4 space-y-3 bg-apex-surface/40">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-apex-text">Observer</p>
                          <p className="text-xs text-apex-muted">Simulation Trading Tier</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-apex-hover text-apex-muted">
                          {profile?.subscription?.plan === 'OBSERVER' ? 'Current' : 'Free'}
                        </span>
                      </div>
                      <ul className="text-xs text-apex-muted space-y-1">
                        <li>• Simulation trading desk</li>
                        <li>• Real market quotes</li>
                        <li>• Risk Vault controls</li>
                      </ul>
                    </div>

                    {/* Core */}
                    <div className="rounded-xl border border-apex-border p-4 space-y-3 bg-apex-surface/40 hover:border-apex-accent/40 transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-apex-text">Core</p>
                          <p className="text-xs text-apex-muted">Algorithmic Execution</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-apex-accent/10 text-apex-accent">
                          Popular
                        </span>
                      </div>
                      <ul className="text-xs text-apex-muted space-y-1">
                        <li>• Autopilot execution</li>
                        <li>• Risk Vault enforcement</li>
                        <li>• Real-time alerts</li>
                      </ul>
                      <button
                        type="button"
                        id="upgrade-to-core-btn"
                        onClick={() => handleUpgrade('CORE')}
                        disabled={Boolean(subLoading)}
                        className="w-full py-2 text-xs font-semibold rounded-lg bg-apex-accent text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                      >
                        {subLoading === 'CORE' ? 'Redirecting to checkout…' : 'Upgrade to Core'}
                      </button>
                    </div>

                    {/* Pro */}
                    <div className="rounded-xl border border-apex-accent p-4 space-y-3 bg-apex-surface/60 relative">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-apex-text">Pro</p>
                          <p className="text-xs text-apex-muted">Advanced Quantitative Edge</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-apex-accent text-white">
                          Recommended
                        </span>
                      </div>
                      <ul className="text-xs text-apex-muted space-y-1">
                        <li>• Multi-asset execution</li>
                        <li>• Deep analytics &amp; audit</li>
                        <li>• Priority routing</li>
                      </ul>
                      <button
                        type="button"
                        id="upgrade-to-pro-btn"
                        onClick={() => handleUpgrade('PRO')}
                        disabled={Boolean(subLoading)}
                        className="w-full py-2 text-xs font-semibold rounded-lg bg-apex-accent text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                      >
                        {subLoading === 'PRO' ? 'Redirecting to checkout…' : 'Upgrade to Pro'}
                      </button>
                    </div>

                    {/* Elite */}
                    <div className="rounded-xl border border-apex-border p-4 space-y-3 bg-apex-surface/40 hover:border-purple-500/40 transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-apex-text">Elite</p>
                          <p className="text-xs text-apex-muted">Institutional Volume</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400">
                          Institutional
                        </span>
                      </div>
                      <ul className="text-xs text-apex-muted space-y-1">
                        <li>• Unlimited capital allocation</li>
                        <li>• Global Brain V2 access</li>
                        <li>• Dedicated quant onboarding</li>
                      </ul>
                      <button
                        type="button"
                        id="upgrade-to-elite-btn"
                        onClick={() => handleUpgrade('ELITE')}
                        disabled={Boolean(subLoading)}
                        className="w-full py-2 text-xs font-semibold rounded-lg border border-apex-border bg-apex-hover text-apex-text hover:border-purple-500/40 transition-colors disabled:opacity-50"
                      >
                        {subLoading === 'ELITE' ? 'Redirecting to checkout…' : 'Upgrade to Elite'}
                      </button>
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
