'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import {
  aiBrainApi,
  AISignalCardData,
} from '@/lib/ai-brain-client';
import {
  Brain,
  RefreshCw,
  Cpu,
  Clock,
  Inbox,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function AdvisoryPage() {
  const [filter, setFilter] = useState<'ALL' | 'STOCKS' | 'CRYPTO' | 'FOREX'>('ALL');

  const {
    data: signals = [],
    isLoading: loading,
    refetch,
  } = useQuery<AISignalCardData[]>({
    queryKey: ['advisory-signals'],
    queryFn: () => aiBrainApi.getAdvisorySignals(),
    staleTime: 30_000,
  });

  const filteredSignals =
    filter === 'ALL'
      ? signals
      : signals.filter((s) => s.assetClass === filter);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8">

        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-apex-text tracking-tight">AI Advisory Signals</h1>
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-apex-border bg-apex-surface text-[10px] font-bold uppercase tracking-wider text-apex-muted">
                Quantitative Gating
              </span>
            </div>
            <p className="mt-1 text-sm text-apex-muted">
              High-conviction market structure signals filtered through SCOPED_EDGE confidence gates.
            </p>
          </div>

          <button
            onClick={() => refetch()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-apex-border bg-apex-surface px-4 py-2 text-xs font-semibold text-apex-text hover:bg-apex-hover transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            <span>Refresh Signals</span>
          </button>
        </div>

        {/* Advisory Engine Status */}
        <div className="rounded-2xl border border-apex-border bg-apex-surface p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-apex-border pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-apex-accent/10 text-apex-accent">
                <Brain size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-apex-text">Signal Engine Policy</h2>
                <p className="text-xs text-apex-muted">Smart Money Concepts &amp; 0.55 WIN-probability confidence gating</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-apex-success/10 border border-apex-success/30">
              <span className="h-2 w-2 rounded-full bg-apex-success" />
              <span className="text-xs font-semibold text-apex-success">Engine Active</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="rounded-xl border border-apex-border bg-apex-bg p-3">
              <span className="text-apex-muted uppercase font-bold tracking-wider text-[10px]">Active Coverage</span>
              <p className="mt-1 text-sm font-semibold text-apex-text">US Equities (S&amp;P 500, Nasdaq 100)</p>
            </div>
            <div className="rounded-xl border border-apex-border bg-apex-bg p-3">
              <span className="text-apex-muted uppercase font-bold tracking-wider text-[10px]">Confidence Gate</span>
              <p className="mt-1 text-sm font-semibold text-apex-text">&gt; 55% Win Probability</p>
            </div>
            <div className="rounded-xl border border-apex-border bg-apex-bg p-3">
              <span className="text-apex-muted uppercase font-bold tracking-wider text-[10px]">Risk Enforcement</span>
              <p className="mt-1 text-sm font-semibold text-apex-text">Server-Side Risk Vault</p>
            </div>
            <div className="rounded-xl border border-apex-border bg-apex-bg p-3">
              <span className="text-apex-muted uppercase font-bold tracking-wider text-[10px]">Mode</span>
              <p className="mt-1 text-sm font-semibold text-amber-400">Simulated Paper Execution</p>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center justify-between gap-4 border-b border-apex-border pb-3">
          <div className="flex items-center gap-2">
            {(['ALL', 'STOCKS', 'CRYPTO', 'FOREX'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all',
                  filter === f
                    ? 'bg-apex-accent text-white shadow-sm'
                    : 'text-apex-muted hover:bg-apex-hover hover:text-apex-text',
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs text-apex-muted">
            {filteredSignals.length} {filteredSignals.length === 1 ? 'signal' : 'signals'}
          </span>
        </div>

        {/* Content: Signals Feed or Honest Empty State */}
        {filteredSignals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSignals.map((sig) => (
              <div
                key={sig.id}
                className="rounded-2xl border border-apex-border bg-apex-surface p-5 space-y-4 hover:border-apex-accent/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-apex-text">{sig.symbol}</span>
                    <span className="rounded bg-apex-bg px-2 py-0.5 text-[10px] font-bold text-apex-muted">
                      {sig.timeframe}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-bold uppercase',
                      sig.bias === 'BUY'
                        ? 'bg-apex-success/15 text-apex-success'
                        : 'bg-apex-danger/15 text-apex-danger',
                    )}
                  >
                    {sig.bias}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-apex-muted text-[10px]">Entry</span>
                    <p className="font-mono font-semibold text-apex-text">${sig.entryPrice.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-apex-muted text-[10px]">Stop Loss</span>
                    <p className="font-mono font-semibold text-apex-danger">${sig.stopLoss.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-apex-muted text-[10px]">Take Profit</span>
                    <p className="font-mono font-semibold text-apex-success">${sig.takeProfit.toFixed(2)}</p>
                  </div>
                </div>

                <p className="text-xs text-apex-muted leading-relaxed">{sig.smcInsight}</p>

                <div className="flex items-center justify-between border-t border-apex-border pt-3 text-[11px] text-apex-muted">
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {sig.timestamp}
                  </span>
                  <Link
                    href={`/stocks/trading-desk?symbol=${sig.symbol}`}
                    className="flex items-center gap-1 font-semibold text-apex-accent hover:underline"
                  >
                    Trade on Desk <ExternalLink size={12} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-apex-border bg-apex-surface p-12 text-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-apex-border bg-apex-bg mx-auto text-apex-muted">
              <Inbox size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-apex-text">No Active Advisory Signals</h3>
              <p className="text-xs text-apex-muted max-w-md mx-auto leading-relaxed">
                The advisory engine scans for Smart Money Concepts structural setups. Signals only publish when market conditions meet the minimum confidence threshold.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/stocks/trading-desk"
                className="inline-flex items-center gap-2 rounded-xl bg-apex-accent px-4 py-2 text-xs font-semibold text-white hover:bg-apex-accent/90 transition-colors"
              >
                <Cpu size={14} />
                <span>Open Trading Desk</span>
              </Link>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
