'use client';

import { AppShell } from '@/components/layout/AppShell';
import { useAnalytics } from '@/lib/queries';
import {
  TrendingUp,
  BarChart3,
  Clock,
  Target,
  AlertTriangle,
  Activity,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

// ─── Micro equity curve using SVG path (no external chart dep) ────────────────

function EquityCurve({ data }: { data: { date: string; value: number }[] }) {
  if (!data || data.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-apex-border">
        <p className="text-sm text-apex-muted">No equity data yet. Start trading to build your curve.</p>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const W = 800;
  const H = 200;
  const PAD = 16;

  const points = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((d.value - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `M ${points[0]} L ${points.join(' L ')} L ${W - PAD},${H - PAD} L ${PAD},${H - PAD} Z`;

  const isPositive = values[values.length - 1] >= values[0];
  const strokeColor = isPositive ? 'var(--apex-success)' : 'var(--apex-danger)';
  const fillId = isPositive ? 'fill-success' : 'fill-danger';

  const totalReturn = ((values[values.length - 1] - values[0]) / values[0]) * 100;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-apex-muted">Equity Curve</p>
          <p className={cn('mt-1 text-lg font-bold', isPositive ? 'text-apex-success' : 'text-apex-danger')}>
            {isPositive ? '+' : ''}{totalReturn.toFixed(2)}% total return
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs text-apex-muted">
          <span className="h-2 w-8 rounded-full" style={{ background: strokeColor }} />
          <span>Equity</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 192 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${fillId})`} />
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Start and end dots */}
        <circle cx={PAD} cy={H - PAD - ((values[0] - min) / range) * (H - PAD * 2)} r="3" fill={strokeColor} />
        <circle
          cx={W - PAD}
          cy={H - PAD - ((values[values.length - 1] - min) / range) * (H - PAD * 2)}
          r="4"
          fill={strokeColor}
        />
      </svg>
      {/* X-axis labels */}
      <div className="mt-1 flex justify-between text-xs text-apex-muted">
        <span>{data[0]?.date}</span>
        <span>{data[Math.floor(data.length / 2)]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function MetricSkeleton() {
  return (
    <div className="rounded-2xl border border-apex-border bg-apex-surface p-5">
      <div className="h-3 w-20 animate-pulse rounded bg-apex-border" />
      <div className="mt-3 h-7 w-28 animate-pulse rounded bg-apex-border" />
    </div>
  );
}

// ─── Trade row ────────────────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: {
  id: string; symbol: string; direction: 'BUY' | 'SELL'; qty: number;
  entryPrice: number; exitPrice: number | null; pnl: number | null;
  status: string; mode: string; openedAt: string; closedAt: string | null;
}}) {
  const pnl = trade.pnl ?? 0;
  const isPositive = pnl >= 0;
  const isOpen = !trade.closedAt;

  return (
    <div className="flex items-center justify-between border-b border-apex-border py-3 last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold',
            trade.direction === 'BUY'
              ? 'bg-apex-success/10 text-apex-success'
              : 'bg-apex-danger/10 text-apex-danger',
          )}
        >
          {trade.direction === 'BUY' ? (
            <ArrowUpRight size={14} />
          ) : (
            <ArrowDownRight size={14} />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-apex-text">{trade.symbol}</p>
          <p className="text-xs text-apex-muted">
            {trade.qty} shares · {trade.mode === 'LIVE' ? 'Live' : 'Simulation'}
          </p>
        </div>
      </div>

      <div className="text-right">
        {isOpen ? (
          <p className="text-xs font-medium text-apex-warning">Open</p>
        ) : (
          <p
            className={cn(
              'text-sm font-semibold',
              isPositive ? 'text-apex-success' : 'text-apex-danger',
            )}
          >
            {isPositive ? '+' : ''}${pnl.toFixed(2)}
          </p>
        )}
        <p className="text-xs text-apex-muted">
          {new Date(trade.openedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ASSET_CLASSES = ['STOCKS', 'CRYPTO', 'FOREX'] as const;
type AssetClass = (typeof ASSET_CLASSES)[number];

export default function PerformancePage() {
  const [activeClass, setActiveClass] = useState<AssetClass>('STOCKS');
  const [tradeMode, setTradeMode] = useState<'all' | 'live' | 'sim'>('all');

  const { data, isLoading } = useAnalytics(activeClass);

  const metrics = [
    {
      label: 'Win Rate',
      value: data ? `${(data.winRate * 100).toFixed(1)}%` : '—',
      positive: (data?.winRate ?? 0) >= 0.5,
      icon: Target,
    },
    {
      label: 'Total Trades',
      value: data ? String(data.totalTrades) : '—',
      positive: undefined,
      icon: BarChart3,
    },
    {
      label: 'Sharpe Ratio',
      value: data?.sharpeRatio != null ? data.sharpeRatio.toFixed(2) : '—',
      positive: (data?.sharpeRatio ?? 0) > 1,
      icon: Activity,
    },
    {
      label: 'Avg Hold Time',
      value: data?.avgHoldTime != null ? `${Math.round(data.avgHoldTime)}h` : '—',
      positive: undefined,
      icon: Clock,
    },
    {
      label: 'Max Drawdown',
      value: data?.maxDrawdown != null ? `${data.maxDrawdown.toFixed(1)}%` : '—',
      positive: false,
      icon: AlertTriangle,
    },
    {
      label: 'Open Positions',
      value: data ? String(data.trades?.filter((t) => !t.closedAt).length ?? 0) : '—',
      positive: undefined,
      icon: TrendingUp,
    },
  ];

  const filteredTrades = (data?.trades ?? []).filter((t) => {
    if (tradeMode === 'live') return t.mode === 'LIVE';
    if (tradeMode === 'sim') return t.mode === 'SIMULATION';
    return true;
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-apex-text">Performance</h1>
            <p className="mt-0.5 text-sm text-apex-muted">Your trading outcomes across all sessions</p>
          </div>
          {/* Asset class tabs */}
          <div className="flex gap-1 rounded-xl border border-apex-border bg-apex-surface p-1">
            {ASSET_CLASSES.map((cls) => (
              <button
                key={cls}
                id={`perf-tab-${cls.toLowerCase()}`}
                onClick={() => setActiveClass(cls)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  activeClass === cls
                    ? 'bg-apex-accent text-white'
                    : 'text-apex-muted hover:text-apex-text',
                )}
              >
                {cls}
              </button>
            ))}
          </div>
        </div>

        {/* ── Metrics grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <MetricSkeleton key={i} />)
            : metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-2xl border border-apex-border bg-apex-surface p-4"
                >
                  <div className="flex items-center gap-1.5 text-apex-muted">
                    <m.icon size={12} />
                    <p className="text-xs font-medium uppercase tracking-wider">{m.label}</p>
                  </div>
                  <p
                    className={cn(
                      'mt-2 text-xl font-bold',
                      m.positive === true
                        ? 'text-apex-success'
                        : m.positive === false
                          ? 'text-apex-danger'
                          : 'text-apex-text',
                    )}
                  >
                    {m.value}
                  </p>
                </div>
              ))}
        </div>

        {/* ── Sim vs Live Performance Compare ─────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Simulation Paper Mode</span>
              <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">Sandbox</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-apex-muted">Sim Win Rate</p>
                <p className="font-bold text-apex-text mt-0.5">
                  {(data?.trades?.filter((t) => t.mode === 'SIMULATION' && (t.pnl ?? 0) > 0).length ?? 0) /
                    Math.max(1, data?.trades?.filter((t) => t.mode === 'SIMULATION').length ?? 1) *
                    100}%
                </p>
              </div>
              <div>
                <p className="text-xs text-apex-muted">Sim Trades</p>
                <p className="font-bold text-apex-text mt-0.5">
                  {data?.trades?.filter((t) => t.mode === 'SIMULATION').length ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-apex-success/30 bg-apex-success/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-apex-success">Live Broker Execution</span>
              <span className="rounded-md bg-apex-success/20 px-2 py-0.5 text-[10px] font-semibold text-apex-success">Alpaca Live</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-apex-muted">Live Win Rate</p>
                <p className="font-bold text-apex-text mt-0.5">
                  {data?.trades?.filter((t) => t.mode === 'LIVE').length ? 
                    `${((data.trades.filter((t) => t.mode === 'LIVE' && (t.pnl ?? 0) > 0).length / data.trades.filter((t) => t.mode === 'LIVE').length) * 100).toFixed(1)}%`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-apex-muted">Live Trades</p>
                <p className="font-bold text-apex-text mt-0.5">
                  {data?.trades?.filter((t) => t.mode === 'LIVE').length ?? 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Equity curve ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-apex-border bg-apex-surface p-6">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-3 w-24 animate-pulse rounded bg-apex-border" />
              <div className="h-48 w-full animate-pulse rounded-xl bg-apex-border" />
            </div>
          ) : (
            <EquityCurve data={data?.equityCurve ?? []} />
          )}
        </div>

        {/* ── Trade history ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-apex-border bg-apex-surface">
          <div className="flex items-center justify-between border-b border-apex-border px-6 py-4">
            <h2 className="text-sm font-semibold text-apex-text">Trade History</h2>
            {/* Mode filter */}
            <div className="flex gap-1 rounded-lg border border-apex-border bg-apex-bg p-1">
              {(['all', 'live', 'sim'] as const).map((mode) => (
                <button
                  key={mode}
                  id={`trade-filter-${mode}`}
                  onClick={() => setTradeMode(mode)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                    tradeMode === mode
                      ? 'bg-apex-surface text-apex-text shadow-sm'
                      : 'text-apex-muted hover:text-apex-text',
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between border-b border-apex-border py-3 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 animate-pulse rounded-lg bg-apex-border" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-16 animate-pulse rounded bg-apex-border" />
                      <div className="h-2.5 w-24 animate-pulse rounded bg-apex-border" />
                    </div>
                  </div>
                  <div className="space-y-1.5 text-right">
                    <div className="h-3 w-14 animate-pulse rounded bg-apex-border" />
                    <div className="h-2.5 w-20 animate-pulse rounded bg-apex-border" />
                  </div>
                </div>
              ))
            ) : filteredTrades.length === 0 ? (
              <div className="flex h-32 items-center justify-center">
                <p className="text-sm text-apex-muted">
                  {data
                    ? `No ${tradeMode === 'all' ? '' : tradeMode + ' '}trades yet.`
                    : 'No performance data yet.'}
                </p>
              </div>
            ) : (
              filteredTrades.slice(0, 20).map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))
            )}
          </div>

          {filteredTrades.length > 20 && (
            <div className="border-t border-apex-border px-6 py-3">
              <button className="flex w-full items-center justify-center gap-1 text-xs font-medium text-apex-accent hover:underline">
                View all {filteredTrades.length} trades
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>

        {/* ── Disclaimer ─────────────────────────────────────────────────── */}
        <p className="text-center text-xs text-apex-muted">
          Past performance does not guarantee future results. Simulation results may differ from live trading outcomes.
        </p>
      </div>
    </AppShell>
  );
}
