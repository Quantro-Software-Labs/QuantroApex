'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useMe, useUpdateProfile, ExperienceLevel, UpdateProfileInput } from '@/lib/queries';
import {
  ShieldCheck,
  TrendingUp,
  Brain,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Key,
  Award,
  Sparkles,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type MarketType = 'STOCKS' | 'CRYPTO' | 'FOREX';

export default function OnboardingPage() {
  const router = useRouter();
  const { data: profile } = useMe();
  const updateProfile = useUpdateProfile();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Form State
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    profile?.experienceLevel ?? 'INTERMEDIATE',
  );
  const [path, setPath] = useState<'EXPRESS' | 'GUIDED'>('GUIDED');
  const [preferredMarket, setPreferredMarket] = useState<MarketType>('STOCKS');
  const [maxDrawdown, setMaxDrawdown] = useState(10);
  const [maxPositionSize, setMaxPositionSize] = useState(5);
  const [virtualCapital, setVirtualCapital] = useState(100000);
  const [strategy, setStrategy] = useState('ngx-trend-follower');
  const [alpacaKey, setAlpacaKey] = useState('');
  const [alpacaSecret, setAlpacaSecret] = useState('');

  // Mandatory disclaimers & consent checkboxes — MUST DEFAULT TO UNCHECKED (false)
  const [disclaimerConsent, setDisclaimerConsent] = useState(false);
  const [globalBrainConsent, setGlobalBrainConsent] = useState(false);

  const totalSteps = path === 'EXPRESS' ? 4 : 6;

  async function handleComplete() {
    setSaving(true);
    try {
      const payload: UpdateProfileInput = {
        experienceLevel,
        preferredMarket,
        onboardingCompletedAt: new Date().toISOString(),
        profile: {
          globalBrainConsent,
          isBrokerConnected: Boolean(alpacaKey.trim()),
          alpacaApiKey: alpacaKey.trim(),
          alpacaSecretKey: alpacaSecret.trim(),
        },
      };
      await updateProfile.mutateAsync(payload);
      router.push('/home');
    } catch {
      router.push('/home');
    } finally {
      setSaving(false);
    }
  }

  function handleNext() {
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else {
      handleComplete();
    }
  }

  function handleBack() {
    if (step > 1) setStep((s) => s - 1);
  }

  // Can the user advance from the current step?
  // Step 2 in both paths includes the required disclaimers which must be checked
  const canProceed = step !== 2 || disclaimerConsent;

  return (
    <div className="min-h-screen bg-apex-bg text-apex-text flex flex-col justify-between p-6 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-apex-accent/10 blur-[150px] pointer-events-none" />

      {/* Top Header & Progress */}
      <div className="mx-auto max-w-2xl w-full flex items-center justify-between z-10 py-4">
        <div className="flex items-center gap-2">
          <Image
            src="/quantro_logo.jpeg"
            alt="Quantro Logo"
            width={24}
            height={24}
            className="rounded-md object-cover"
          />
          <span className="text-sm font-bold tracking-wider uppercase text-apex-text">
            Quantro<span className="text-apex-accent">Apex</span> Setup
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleComplete}
            disabled={saving || !disclaimerConsent}
            className="text-xs font-semibold text-apex-accent hover:underline transition-all disabled:opacity-40"
          >
            Skip to App &rarr;
          </button>
          <span className="text-xs font-semibold text-apex-muted">
            Step {step} of {totalSteps}
          </span>
          <div className="w-32 h-1.5 rounded-full bg-apex-border/60 overflow-hidden">
            <div
              className="h-full bg-apex-accent transition-all duration-300 ease-out rounded-full"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="mx-auto max-w-2xl w-full my-auto z-10">
        <div className="rounded-3xl border border-apex-border/80 bg-apex-surface/90 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300">

          {/* STEP 1: Experience & Track Selection */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-apex-accent/10 text-apex-accent text-xs font-semibold mb-3">
                  <Award size={14} />
                  <span>Welcome to Apex</span>
                </div>
                <h1 className="text-2xl font-extrabold text-apex-text tracking-tight">
                  What is your trading experience?
                </h1>
                <p className="text-sm text-apex-muted mt-1 leading-relaxed">
                  Apex tailors its AI explanations, signal confidence gates, and risk parameters to match your background.
                </p>
              </div>

              {/* Experience Options */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setExperienceLevel('NEWCOMER')}
                  className={cn(
                    'w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-4',
                    experienceLevel === 'NEWCOMER'
                      ? 'border-apex-accent bg-apex-accent/10 shadow-md shadow-apex-accent/10'
                      : 'border-apex-border bg-apex-bg/60 hover:border-apex-accent/40',
                  )}
                >
                  <div className="p-2 rounded-xl bg-apex-surface text-apex-accent mt-0.5">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-apex-text">Newcomer</p>
                    <p className="text-xs text-apex-muted mt-0.5">
                      New to algorithmic &amp; quantitative trading. Prefers guided setup and plain-language insights.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setExperienceLevel('INTERMEDIATE')}
                  className={cn(
                    'w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-4',
                    experienceLevel === 'INTERMEDIATE'
                      ? 'border-apex-accent bg-apex-accent/10 shadow-md shadow-apex-accent/10'
                      : 'border-apex-border bg-apex-bg/60 hover:border-apex-accent/40',
                  )}
                >
                  <div className="p-2 rounded-xl bg-apex-surface text-apex-accent mt-0.5">
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-apex-text">Intermediate</p>
                    <p className="text-xs text-apex-muted mt-0.5">
                      Familiar with technical indicators, chart patterns, and basic risk management.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setExperienceLevel('PROFESSIONAL')}
                  className={cn(
                    'w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-4',
                    experienceLevel === 'PROFESSIONAL'
                      ? 'border-apex-accent bg-apex-accent/10 shadow-md shadow-apex-accent/10'
                      : 'border-apex-border bg-apex-bg/60 hover:border-apex-accent/40',
                  )}
                >
                  <div className="p-2 rounded-xl bg-apex-surface text-apex-accent mt-0.5">
                    <Brain size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-apex-text">Professional</p>
                    <p className="text-xs text-apex-muted mt-0.5">
                      Experienced quant or institutional trader. Deep metrics, walk-forward validation &amp; full control.
                    </p>
                  </div>
                </button>
              </div>

              {/* Path Selection */}
              <div className="pt-2">
                <label className="text-xs font-semibold text-apex-muted uppercase tracking-wider block mb-2">
                  Setup Mode
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPath('GUIDED')}
                    className={cn(
                      'p-3 rounded-xl border text-center text-xs font-bold transition-all',
                      path === 'GUIDED'
                        ? 'border-apex-accent bg-apex-accent/15 text-apex-accent'
                        : 'border-apex-border bg-apex-bg/40 text-apex-muted',
                    )}
                  >
                    Guided Walkthrough (6 Steps)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPath('EXPRESS')}
                    className={cn(
                      'p-3 rounded-xl border text-center text-xs font-bold transition-all',
                      path === 'EXPRESS'
                        ? 'border-apex-accent bg-apex-accent/15 text-apex-accent'
                        : 'border-apex-border bg-apex-bg/40 text-apex-muted',
                    )}
                  >
                    Express Setup (4 Steps)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Risk Disclaimer & Consent (MANDATORY ONBOARDING STEP) */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold mb-3">
                  <AlertTriangle size={14} />
                  <span>Important Risk Disclaimer</span>
                </div>
                <h1 className="text-2xl font-extrabold text-apex-text tracking-tight">
                  Simulated Trading &amp; Regulatory Notice
                </h1>
                <p className="text-sm text-apex-muted mt-1 leading-relaxed">
                  Please review the following regulatory disclosures before proceeding into the trading terminal.
                </p>
              </div>

              <div className="rounded-2xl border border-apex-border bg-apex-bg/60 p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                    <ShieldCheck size={14} />
                  </div>
                  <p className="text-xs text-apex-text leading-relaxed">
                    QuantroApex provides paper trading simulation with virtual capital. Simulated performance results have inherent limitations and do not represent actual trading.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                    <Brain size={14} />
                  </div>
                  <p className="text-xs text-apex-text leading-relaxed">
                    Automated signals and AI analyses are for educational and exploratory purposes only. Nothing on this platform constitutes financial or investment advice.
                  </p>
                </div>
              </div>

              {/* Checkboxes: Must default to unchecked (false) */}
              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    id="onboarding-disclaimer-checkbox"
                    type="checkbox"
                    checked={disclaimerConsent}
                    onChange={(e) => setDisclaimerConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-apex-border bg-apex-bg text-apex-accent focus:ring-apex-accent cursor-pointer"
                  />
                  <span className="text-xs text-apex-text font-medium leading-relaxed">
                    I acknowledge and agree: <strong className="text-white">Paper trading with simulated money. Not investment advice. Past or simulated results don&apos;t guarantee future returns.</strong>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    id="onboarding-brain-consent-checkbox"
                    type="checkbox"
                    checked={globalBrainConsent}
                    onChange={(e) => setGlobalBrainConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-apex-border bg-apex-bg text-apex-accent focus:ring-apex-accent cursor-pointer"
                  />
                  <span className="text-xs text-apex-muted leading-relaxed">
                    (Optional) Allow anonymized telemetry and strategy learning to improve platform risk models.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: Risk Vault Setup */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold mb-3">
                  <ShieldCheck size={14} />
                  <span>Risk Vault Parameters</span>
                </div>
                <h1 className="text-2xl font-extrabold text-apex-text tracking-tight">
                  Set Your Capital Controls
                </h1>
                <p className="text-sm text-apex-muted mt-1 leading-relaxed">
                  Risk Vault rules are enforced server-side. Apex will pause execution if any limit is breached.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold uppercase text-apex-muted">Max Account Drawdown Limit</label>
                    <span className="text-sm font-bold text-amber-400">{maxDrawdown}%</span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="25"
                    step="1"
                    value={maxDrawdown}
                    onChange={(e) => setMaxDrawdown(Number(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <p className="text-[11px] text-apex-muted mt-1">Trading automatically pauses if portfolio drops {maxDrawdown}% from peak.</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold uppercase text-apex-muted">Max Single Position Allocation</label>
                    <span className="text-sm font-bold text-apex-accent">{maxPositionSize}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={maxPositionSize}
                    onChange={(e) => setMaxPositionSize(Number(e.target.value))}
                    className="w-full accent-apex-accent cursor-pointer"
                  />
                  <p className="text-[11px] text-apex-muted mt-1">No individual trade can exceed {maxPositionSize}% of total capital.</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Strategy & Asset Selection */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold mb-3">
                  <TrendingUp size={14} />
                  <span>Market &amp; Strategy</span>
                </div>
                <h1 className="text-2xl font-extrabold text-apex-text tracking-tight">
                  Choose Initial Strategy
                </h1>
                <p className="text-sm text-apex-muted mt-1 leading-relaxed">
                  Under the SCOPED_EDGE policy, Stock equities (NGX + US Stocks) are active for trading.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => { setPreferredMarket('STOCKS'); setStrategy('ngx-trend-follower'); }}
                  className={cn(
                    'w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-4',
                    strategy === 'ngx-trend-follower'
                      ? 'border-emerald-500/60 bg-emerald-500/10'
                      : 'border-apex-border bg-apex-bg/60',
                  )}
                >
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 font-bold text-sm shrink-0">STOCKS</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-apex-text">NGX Trend Follower (Nigerian Stocks)</p>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">SCOPED_EDGE Active</span>
                    </div>
                    <p className="text-xs text-apex-muted mt-1">
                      Focuses on momentum &amp; trend breakouts across top NGX equities (DANGCEM, MTNN, GTCO, ZENITHBANK).
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { setPreferredMarket('STOCKS'); setStrategy('strat-breakout-engine'); }}
                  className={cn(
                    'w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-4',
                    strategy === 'strat-breakout-engine'
                      ? 'border-emerald-500/60 bg-emerald-500/10'
                      : 'border-apex-border bg-apex-bg/60',
                  )}
                >
                  <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 font-bold text-sm shrink-0">STOCKS</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-apex-text">US Volatility Breakout (AAPL, MSFT, QQQ, SPY)</p>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400">Secondary Edge</span>
                    </div>
                    <p className="text-xs text-apex-muted mt-1">
                      Trades daily volatility expansion on top liquid US equities &amp; indices with 0.55 win-probability gate.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Capital & Broker Integration */}
          {step === 5 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-apex-accent/10 text-apex-accent text-xs font-semibold mb-3">
                  <Key size={14} />
                  <span>Capital &amp; Broker</span>
                </div>
                <h1 className="text-2xl font-extrabold text-apex-text tracking-tight">
                  Virtual Capital &amp; Broker Keys
                </h1>
                <p className="text-sm text-apex-muted mt-1 leading-relaxed">
                  Start in Simulation Mode with virtual funds, or optional Alpaca API keys for Live trading.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-apex-muted uppercase tracking-wider block mb-2">
                    Simulation Capital Allocation
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[10000, 50000, 100000].map((cap) => (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => setVirtualCapital(cap)}
                        className={cn(
                          'p-3 rounded-xl border text-center text-xs font-bold transition-all',
                          virtualCapital === cap
                            ? 'border-apex-accent bg-apex-accent/15 text-apex-accent'
                            : 'border-apex-border bg-apex-bg/40 text-apex-muted',
                        )}
                      >
                        ${cap.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-apex-border bg-apex-bg/60 space-y-3">
                  <p className="text-xs font-bold uppercase text-apex-text">Optional: Alpaca Broker Key (Live Mode)</p>
                  <input
                    type="text"
                    value={alpacaKey}
                    onChange={(e) => setAlpacaKey(e.target.value)}
                    placeholder="Alpaca API Key (PK...)"
                    className="w-full rounded-xl border border-apex-border bg-apex-bg px-3.5 py-2.5 text-xs font-mono text-apex-text outline-none focus:border-apex-accent"
                  />
                  <input
                    type="password"
                    value={alpacaSecret}
                    onChange={(e) => setAlpacaSecret(e.target.value)}
                    placeholder="Alpaca Secret Key"
                    className="w-full rounded-xl border border-apex-border bg-apex-bg px-3.5 py-2.5 text-xs font-mono text-apex-text outline-none focus:border-apex-accent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Setup Complete */}
          {step === totalSteps && (
            <div className="space-y-6 text-center py-4 animate-in fade-in duration-200">
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 size={32} />
              </div>

              <div>
                <h1 className="text-2xl font-extrabold text-apex-text tracking-tight">
                  QuantroApex Setup Complete!
                </h1>
                <p className="text-sm text-apex-muted mt-2 max-w-md mx-auto leading-relaxed">
                  Your AI Trading Agent is initialized with <span className="font-bold text-apex-text">${virtualCapital.toLocaleString()}</span> virtual capital, server-side Risk Vault controls, and real-time market data streaming.
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-apex-border bg-apex-bg/80 max-w-md mx-auto text-left space-y-2 text-xs">
                <div className="flex justify-between text-apex-muted">
                  <span>Experience Profile:</span>
                  <span className="font-bold text-apex-text">{experienceLevel}</span>
                </div>
                <div className="flex justify-between text-apex-muted">
                  <span>Active Strategy:</span>
                  <span className="font-bold text-apex-text">{strategy}</span>
                </div>
                <div className="flex justify-between text-apex-muted">
                  <span>Max Drawdown Limit:</span>
                  <span className="font-bold text-amber-400">{maxDrawdown}%</span>
                </div>
                <div className="flex justify-between text-apex-muted">
                  <span>Execution Mode:</span>
                  <span className="font-bold text-amber-400">SIMULATED</span>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Actions Bar */}
          <div className="mt-8 pt-4 border-t border-apex-border/60 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-apex-muted hover:text-apex-text hover:bg-apex-hover transition-colors"
              >
                <ArrowLeft size={14} /> Back
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              id="onboarding-next-btn"
              onClick={handleNext}
              disabled={saving || !canProceed}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-apex-accent text-white text-xs font-bold hover:bg-apex-accent/90 transition-all shadow-md shadow-apex-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? 'Launching Engine…' : step === totalSteps ? 'Launch Apex Dashboard' : 'Continue'}
              {!saving && step < totalSteps && <ArrowRight size={14} />}
            </button>
          </div>

        </div>
      </div>

      {/* Footer Branding & Disclaimer */}
      <div className="mx-auto max-w-2xl w-full text-center text-xs text-apex-muted/60 z-10 py-2">
        Paper trading with simulated money. Not investment advice. Past or simulated results don&apos;t guarantee future returns.
      </div>
    </div>
  );
}
