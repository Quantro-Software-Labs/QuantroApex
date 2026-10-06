'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  aiBrainApi,
  AISignalCardData,
  GlobalBrainStats,
} from '@/lib/ai-brain-client';
import {
  Brain,
  Zap,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Cpu,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function AdvisoryPage() {
  const [signals, setSignals] = useState<AISignalCardData[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'STOCKS' | 'CRYPTO' | 'FOREX'>('ALL');
  const [loading, setLoading] = useState(true);
  const [executedSignalId, setExecutedSignalId] = useState<string | null>(null);
  const [stats, setStats] = useState<GlobalBrainStats | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [fetchedSignals, fetchedStats] = await Promise.all([
        aiBrainApi.getAdvisorySignals(),
        aiBrainApi.getBrainStats(),
      ]);
      setSignals(fetchedSignals);
      setStats(fetchedStats);
      setLoading(false);
    }
    loadData();
  }, []);

  const filteredSignals =
    filter === 'ALL'
      ? signals
      : signals.filter((s) => s.assetClass === filter);

  function handleExecute(id: string) {
    setExecutedSignalId(id);
    setTimeout(() => setExecutedSignalId(null), 3000);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8">
        
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-apex-text tracking-tight">Global Brain AI Advisory</h1>
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                <Sparkles size={10} />
                Illustrative / Demo Signals
              </span>
            </div>
            <p className="mt-1 text-sm text-apex-muted">
              Predictive market intelligence, Smart Money Concepts (SMC) structural insights, and automated signal routing.
            </p>
          </div>

          <button
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 600);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-apex-border bg-apex-surface px-4 py-2 text-xs font-semibold text-apex-text hover:bg-apex-hover transition-all"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            <span>Refresh Brain Signals</span>
          </button>
        </div>

        {/* ─── Global Brain Advisory Intelligence Bar ────────────────── */}
        <div className="rounded-2xl border border-apex-border/80 bg-apex-surface/80 p-6 backdrop-blur-md shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-apex-border/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-apex-accent/10 text-apex-accent">
                <Brain size={20} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-apex-text">Global Brain Advisory Intelligence</h2>
                <p className="text-[11px] text-apex-muted">Real-time Smart Money Concepts (SMC) & high-conviction signal routing</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-apex-success/10 border border-apex-success/30">
              <span className="h-2 w-2 rounded-full bg-apex-success animate-ping" />
              <span className="text-xs font-semibold text-apex-success">Active Signal Engine</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
            <div className="rounded-xl border border-apex-border/40 bg-[#060D1A]/60 p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-apex-muted tracking-wider">Active Asset Coverage</span>
              <p className="text-base font-extrabold text-apex-text font-mono">
                US Equities
              </p>
              <p className="text-[10px] text-apex-muted">S&P 500 & Nasdaq 100 Leaders</p>
            </div>

            <div className="rounded-xl border border-apex-border/40 bg-[#060D1A]/60 p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-apex-muted tracking-wider">Analysis Model</span>
              <p className="text-base font-extrabold text-apex-success font-mono">
                Quantro SMC V2
              </p>
              <p className="text-[10px] text-apex-muted">Order Block & FVG Retests</p>
            </div>

            <div className="rounded-xl border border-apex-border/40 bg-[#060D1A]/60 p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-apex-muted tracking-wider">Confidence Gate</span>
              <p className="text-base font-extrabold text-apex-accent font-mono">
                85%+ Conviction
              </p>
              <p className="text-[10px] text-apex-muted">High-Probability Setups Only</p>
            </div>

            <div className="rounded-xl border border-apex-border/40 bg-[#060D1A]/60 p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-apex-muted tracking-wider">Signal Execution</span>
              <p className="text-base font-extrabold text-apex-text font-mono">
                Direct Apex Routing
              </p>
              <p className="text-[10px] text-apex-muted">Paper & Live Trade Desk</p>
            </div>
          </div>
        </div>

        {/* ─── Filter Tabs ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 border-b border-apex-border pb-3">
          <div className="flex items-center gap-2">
            {(['ALL', 'STOCKS', 'CRYPTO', 'FOREX'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all relative',
                  filter === f
                    ? 'bg-apex-accent text-white shadow-md shadow-apex-accent/20'
                    : 'text-apex-muted hover:bg-apex-surface hover:text-apex-text'
                )}
              >
                <span>{f}</span>
                {(f === 'CRYPTO' || f === 'FOREX') && (
                  <span className={cn(
                    'text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider',
                    filter === f ? 'bg-white/20 text-white' : 'bg-apex-accent/20 text-apex-accent'
                  )}>
                    SOON
                  </span>
                )}
              </button>
            ))}
          </div>
          <span className="text-xs text-apex-muted font-medium">
            Showing <strong className="text-apex-text">
              {filter === 'CRYPTO' || filter === 'FOREX' ? 0 : filteredSignals.length}
            </strong> active signals
          </span>
        </div>

        {/* ─── Signals Feed Cards Grid or Coming Soon State ────────────── */}
        {filter === 'CRYPTO' || filter === 'FOREX' ? (
          <div className="rounded-2xl border border-apex-border bg-apex-surface p-12 text-center space-y-5 shadow-xl max-w-2xl mx-auto my-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-apex-accent/10 text-apex-accent border border-apex-accent/20">
              <Clock size={28} />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-apex-accent/10 border border-apex-accent/30 text-apex-accent">
                Coming Soon
              </span>
              <h3 className="text-xl font-extrabold text-apex-text">
                {filter === 'CRYPTO' ? 'Crypto Advisory Signals' : 'Forex Advisory Signals'} Under Calibration
              </h3>
              <p className="text-sm text-apex-muted max-w-lg mx-auto leading-relaxed">
                Our Smart Money Concepts (SMC) deep learning engine for {filter === 'CRYPTO' ? 'Cryptocurrency pairs (BTC, ETH, SOL)' : 'Forex currency pairs (EUR/USD, GBP/USD)'} is currently in final backtesting. Active signals are currently exclusive to US Equities.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setFilter('STOCKS')}
                className="px-5 py-2.5 rounded-xl bg-apex-accent text-white text-xs font-semibold hover:bg-blue-600 transition-all shadow-md shadow-apex-accent/20 flex items-center gap-2"
              >
                <span>View Active US Stock Signals</span>
                <ArrowRight size={14} />
              </button>
              <Link
                href="/stocks/trading-desk"
                className="px-5 py-2.5 rounded-xl border border-apex-border bg-apex-surface text-apex-text text-xs font-semibold hover:bg-apex-hover transition-all"
              >
                Open Trading Desk
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredSignals.map((signal) => (
              <div
                key={signal.id}
                className="rounded-2xl border border-apex-border bg-apex-surface p-6 space-y-5 shadow-xl hover:border-apex-accent/40 transition-all relative group"
              >
                {/* Top Row: Symbol & Bias Badge */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#060D1A] border border-apex-border font-extrabold text-apex-text font-mono">
                      {signal.symbol.substring(0, 4)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-apex-text">{signal.symbol}</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-apex-hover text-apex-muted">
                          {signal.timeframe}
                        </span>
                      </div>
                      <p className="text-xs text-apex-muted">{signal.strategyName}</p>
                    </div>
                  </div>

                  {/* Bias Badge & Confidence */}
                  <div className="flex flex-col items-end gap-1">
                    <div
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase shadow-sm',
                        signal.bias === 'BUY'
                          ? 'bg-apex-success/10 border border-apex-success/30 text-apex-success'
                          : 'bg-apex-danger/10 border border-apex-danger/30 text-apex-danger'
                      )}
                    >
                      {signal.bias === 'BUY' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <span>{signal.bias}</span>
                    </div>
                    <span className="text-[11px] font-bold text-apex-accent font-mono">
                      {signal.confidence}% Confidence
                    </span>
                  </div>
                </div>

                {/* Price Targets Row */}
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#060D1A] p-3 text-center border border-apex-border/40 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-apex-muted block font-sans">ENTRY</span>
                    <span className="font-bold text-apex-text">${signal.entryPrice}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-apex-muted block font-sans">STOP LOSS</span>
                    <span className="font-bold text-apex-danger">${signal.stopLoss}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-apex-muted block font-sans">TAKE PROFIT</span>
                    <span className="font-bold text-apex-success">${signal.takeProfit}</span>
                  </div>
                </div>

                {/* SMC Structural Insight */}
                <div className="rounded-xl border border-apex-accent/20 bg-apex-accent/5 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-apex-accent font-semibold text-[11px] uppercase tracking-wider">
                    <Cpu size={12} />
                    <span>SMC Structural Insight</span>
                  </div>
                  <p className="text-apex-text leading-relaxed">{signal.smcInsight}</p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-apex-border/60">
                  <span className="text-[11px] text-apex-muted">{signal.timestamp}</span>
                  
                  <div className="flex items-center gap-3">
                    <Link
                      href="/stocks/trading-desk"
                      className="text-xs font-semibold text-apex-muted hover:text-apex-text transition-colors"
                    >
                      View Chart
                    </Link>
                    <button
                      onClick={() => handleExecute(signal.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-md',
                        executedSignalId === signal.id
                          ? 'bg-apex-success'
                          : 'bg-apex-accent hover:bg-blue-600 shadow-apex-accent/20'
                      )}
                    >
                      {executedSignalId === signal.id ? (
                        <>
                          <CheckCircle2 size={14} />
                          <span>Signal Executed!</span>
                        </>
                      ) : (
                        <>
                          <Zap size={14} />
                          <span>Execute via Apex</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </AppShell>
  );
}
