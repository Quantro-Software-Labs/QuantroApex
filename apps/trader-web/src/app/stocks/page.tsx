'use client';

import { AppShell } from '@/components/layout/AppShell';
import { useStrategies, useAnalytics, useActivityFeed, useMe } from '@/lib/queries';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { TrendingUp, TrendingDown, BarChart3, Zap, ArrowRight, Play, Square } from 'lucide-react';
import { useToggleApex } from '@/lib/queries';

type Tab = 'overview' | 'agent' | 'strategies' | 'analytics';

export default function StocksPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const { data: profile } = useMe();
  const { data: analyticsData } = useAnalytics('STOCKS');
  const { data: strategiesData } = useStrategies('STOCKS');
  const { data: feedData } = useActivityFeed(1);
  const toggleApex = useToggleApex();

  const agentState = profile?.agentState ?? undefined;
  const isActive = agentState?.isActive ?? false;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'agent', label: 'Apex Agent' },
    { id: 'strategies', label: 'Strategies' },
    { id: 'analytics', label: 'Analytics' },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-apex-text">Stocks</h1>
            <p className="mt-0.5 text-sm text-apex-muted">US equities · powered by Alpaca</p>
          </div>
          <Link
            href="/stocks/trading-desk"
            className="flex items-center gap-2 rounded-xl border border-apex-border bg-apex-surface px-4 py-2.5 text-sm font-medium text-apex-text transition-all hover:border-apex-accent/40 hover:text-apex-accent"
          >
            <BarChart3 size={16} />
            Trading Desk
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-apex-border bg-apex-surface p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`tab-stocks-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-150',
                activeTab === tab.id
                  ? 'bg-apex-accent text-white shadow-sm'
                  : 'text-apex-muted hover:text-apex-text',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <StocksOverview
            isActive={isActive}
            agentState={agentState}
            analyticsData={analyticsData}
            feedData={feedData}
            onToggleApex={() =>
              toggleApex.mutate({ action: isActive ? 'stop' : 'start' })
            }
            toggleLoading={toggleApex.isPending}
          />
        )}
        {activeTab === 'agent' && <ApexAgentTab agentState={agentState} feedData={feedData} />}
        {activeTab === 'strategies' && (
          <StrategiesTab strategies={strategiesData?.strategies ?? []} />
        )}
        {activeTab === 'analytics' && <AnalyticsTab data={analyticsData} />}
      </div>
    </AppShell>
  );
}

// ─── Component Props Interfaces ───────────────────────────────────────────────

interface ActivityFeedEntry {
  id: string;
  title: string;
  description: string;
  pnl?: number | null;
  createdAt: string;
}

interface ActivityFeedData {
  entries?: ActivityFeedEntry[];
}

interface AgentState {
  phase?: string;
  currentStrategy?: {
    id: string;
    name: string;
    slug: string;
    assetClass: string;
    riskLevel: string;
    description: string;
  } | null;
  capitalAllocated?: number;
}

interface StrategyItem {
  id: string;
  name: string;
  description: string;
  riskLevel: string;
  winRate?: number | null;
  userCount?: number;
  isRecommended?: boolean;
}

interface TradeItem {
  id: string;
  symbol: string;
  direction: string;
  entryPrice?: number;
  exitPrice?: number | null;
  pnl?: number | null;
}

interface AnalyticsData {
  winRate: number;
  totalTrades: number;
  avgHoldTime: number;
  sharpeRatio?: number | null;
  maxDrawdown?: number | null;
  trades: TradeItem[];
}

interface StocksOverviewProps {
  isActive: boolean;
  agentState?: AgentState;
  analyticsData?: AnalyticsData;
  feedData?: ActivityFeedData;
  onToggleApex: () => void;
  toggleLoading: boolean;
}

function StocksOverview({ isActive, agentState, analyticsData, feedData, onToggleApex, toggleLoading }: StocksOverviewProps) {
  return (
    <div className="space-y-5">
      {/* Apex control card */}
      <div className="rounded-2xl border border-apex-border bg-apex-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn(
                'relative flex h-2 w-2',
                isActive ? 'text-apex-success' : 'text-apex-muted'
              )}>
                {isActive && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-apex-success opacity-60" />
                )}
                <span className={cn('relative inline-flex h-2 w-2 rounded-full', isActive ? 'bg-apex-success' : 'bg-apex-muted')} />
              </span>
              <h2 className="text-sm font-semibold text-apex-text">
                Apex {isActive ? 'Active' : 'Inactive'}
              </h2>
            </div>
            <p className="mt-1 text-sm text-apex-muted">
              {agentState?.currentStrategy?.name
                ? `Running ${agentState.currentStrategy.name} · ${agentState.currentStrategy.riskLevel} risk`
                : 'No strategy selected. Choose one to start.'}
            </p>
            {(agentState?.capitalAllocated ?? 0) > 0 && (
              <p className="mt-0.5 text-sm text-apex-muted">
                Capital allocated: <span className="font-medium text-apex-text">
                  ${(agentState?.capitalAllocated ?? 0).toLocaleString()}
                </span>
              </p>
            )}
          </div>
          <button
            id="apex-toggle-btn"
            onClick={onToggleApex}
            disabled={toggleLoading}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
              isActive
                ? 'border border-apex-danger/30 bg-apex-danger/10 text-apex-danger hover:bg-apex-danger/20'
                : 'bg-apex-accent text-white shadow-lg shadow-apex-accent/20 hover:bg-apex-accent/90',
              toggleLoading && 'opacity-60 cursor-not-allowed',
            )}
          >
            {isActive ? <Square size={14} /> : <Play size={14} />}
            {isActive ? 'Stop Apex' : 'Start Apex'}
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-apex-border bg-apex-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-apex-muted">Win Rate</p>
          <p className="mt-2 text-2xl font-bold text-apex-text">
            {analyticsData ? `${(analyticsData.winRate * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-apex-border bg-apex-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-apex-muted">Total Trades</p>
          <p className="mt-2 text-2xl font-bold text-apex-text">
            {analyticsData?.totalTrades ?? '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-apex-border bg-apex-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-apex-muted">Sharpe Ratio</p>
          <p className="mt-2 text-2xl font-bold text-apex-text">
            {analyticsData?.sharpeRatio?.toFixed(2) ?? '—'}
          </p>
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-2xl border border-apex-border bg-apex-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-apex-text">Recent Activity</h2>
        {!feedData?.entries?.length ? (
          <div className="py-6 text-center">
            <Zap size={20} className="mx-auto mb-2 text-apex-muted/40" />
            <p className="text-sm text-apex-muted">Apex is monitoring the market.</p>
          </div>
        ) : (
          <div>
            {feedData.entries.slice(0, 6).map((entry: ActivityFeedEntry) => (
              <div key={entry.id} className="flex items-start gap-4 border-b border-apex-border py-3.5 last:border-0">
                <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-apex-accent/60 mt-2" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-apex-text">{entry.title}</p>
                  <p className="mt-0.5 text-sm text-apex-muted">{entry.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  {entry.pnl != null && (
                    <p className={cn('text-sm font-semibold', entry.pnl >= 0 ? 'text-apex-success' : 'text-apex-danger')}>
                      {entry.pnl >= 0 ? '+' : ''}{entry.pnl.toFixed(2)}
                    </p>
                  )}
                  <p className="text-xs text-apex-muted">
                    {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApexAgentTab({ agentState, feedData }: { agentState?: AgentState; feedData?: ActivityFeedData }) {
  const phases = ['OBSERVING', 'LEARNING', 'OPTIMISING', 'AUTONOMOUS'];
  const currentPhase = agentState?.phase ?? 'OBSERVING';
  const phaseIdx = phases.indexOf(currentPhase);

  return (
    <div className="space-y-5">
      {/* Phase indicator */}
      <div className="rounded-2xl border border-apex-border bg-apex-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-apex-text">Agent Phase</h2>
        <div className="flex gap-2">
          {phases.map((phase, i) => (
            <div
              key={phase}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2.5 text-center transition-all',
                i <= phaseIdx
                  ? 'border-apex-accent/30 bg-apex-accent/10 text-apex-accent'
                  : 'border-apex-border text-apex-muted opacity-40',
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest">{phase}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-apex-muted">
          Apex is currently in the <span className="font-semibold text-apex-text">{currentPhase}</span> phase —{' '}
          {currentPhase === 'OBSERVING' && 'watching market conditions and building its first model.'}
          {currentPhase === 'LEARNING' && 'refining its strategy based on trade outcomes.'}
          {currentPhase === 'OPTIMISING' && 'improving signal quality and position sizing.'}
          {currentPhase === 'AUTONOMOUS' && 'operating fully independently, developing its own strategies.'}
        </p>
      </div>

      {/* Full activity feed */}
      <div className="rounded-2xl border border-apex-border bg-apex-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-apex-text">Activity Feed</h2>
        {!feedData?.entries?.length ? (
          <div className="py-6 text-center">
            <p className="text-sm text-apex-muted">No activity recorded yet.</p>
          </div>
        ) : (
          <div>
            {feedData.entries.map((entry: ActivityFeedEntry) => (
              <div key={entry.id} className="flex items-start gap-4 border-b border-apex-border py-3.5 last:border-0">
                <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-apex-accent/60" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-apex-text">{entry.title}</p>
                  <p className="mt-0.5 text-sm text-apex-muted">{entry.description}</p>
                </div>
                <p className="shrink-0 text-xs text-apex-muted">
                  {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StrategiesTab({ strategies }: { strategies: StrategyItem[] }) {
  const riskColor = { LOW: 'text-apex-success', MEDIUM: 'text-amber-400', HIGH: 'text-apex-danger' } as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-apex-text">Strategy Marketplace</h2>
        <p className="text-xs text-apex-muted">{strategies.length} strategies available</p>
      </div>
      {!strategies.length ? (
        <div className="rounded-2xl border border-apex-border bg-apex-surface p-10 text-center">
          <p className="text-sm text-apex-muted">No strategies available. Check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {strategies.map((s) => (
            <div key={s.id} className="group rounded-2xl border border-apex-border bg-apex-surface p-5 transition-all hover:border-apex-accent/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {s.isRecommended && (
                      <span className="rounded-full bg-apex-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-apex-accent">Recommended</span>
                    )}
                  </div>
                  <h3 className="mt-1.5 text-sm font-semibold text-apex-text">{s.name}</h3>
                  <p className="mt-1 text-xs text-apex-muted leading-relaxed">{s.description}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-3 text-xs text-apex-muted">
                  <span className={cn('font-semibold', riskColor[s.riskLevel as keyof typeof riskColor] ?? 'text-apex-muted')}>
                    {s.riskLevel}
                  </span>
                  {s.winRate && <span>{(s.winRate * 100).toFixed(0)}% win rate</span>}
                  <span>{s.userCount} traders</span>
                </div>
                <button className="rounded-lg border border-apex-accent/30 bg-apex-accent/10 px-3 py-1.5 text-xs font-semibold text-apex-accent transition-all hover:bg-apex-accent hover:text-white">
                  Select
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsTab({ data }: { data?: AnalyticsData }) {
  if (!data) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-apex-border bg-apex-surface">
        <p className="text-sm text-apex-muted">No analytics data yet. Start trading to see your performance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Win Rate', value: `${(data.winRate * 100).toFixed(1)}%` },
          { label: 'Total Trades', value: String(data.totalTrades) },
          { label: 'Avg Hold', value: `${data.avgHoldTime}h` },
          { label: 'Max Drawdown', value: data.maxDrawdown ? `${data.maxDrawdown.toFixed(1)}%` : '—' },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl border border-apex-border bg-apex-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-apex-muted">{m.label}</p>
            <p className="mt-2 text-xl font-bold text-apex-text">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Trade history table */}
      <div className="rounded-2xl border border-apex-border bg-apex-surface">
        <div className="border-b border-apex-border px-5 py-4">
          <h2 className="text-sm font-semibold text-apex-text">Trade History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-apex-border text-left text-xs font-medium uppercase tracking-wider text-apex-muted">
                <th className="px-5 py-3">Symbol</th>
                <th className="px-5 py-3">Direction</th>
                <th className="px-5 py-3">Entry</th>
                <th className="px-5 py-3">Exit</th>
                <th className="px-5 py-3">P&L</th>
                <th className="px-5 py-3">Mode</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.trades.map((trade: TradeItem & { mode?: string; openedAt?: string }) => (
                <tr key={trade.id} className="border-b border-apex-border/50 last:border-0 hover:bg-apex-hover/30 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-apex-text">{trade.symbol}</td>
                  <td className="px-5 py-3.5">
                    <span className={cn('font-semibold', trade.direction === 'BUY' ? 'text-apex-success' : 'text-apex-danger')}>
                      {trade.direction}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-apex-muted">${trade.entryPrice?.toFixed(2)}</td>
                  <td className="px-5 py-3.5 text-apex-muted">{trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '—'}</td>
                  <td className="px-5 py-3.5">
                    {trade.pnl != null ? (
                      <span className={cn('font-semibold', trade.pnl >= 0 ? 'text-apex-success' : 'text-apex-danger')}>
                        {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      trade.mode === 'LIVE' ? 'bg-apex-success/10 text-apex-success' : 'bg-amber-500/10 text-amber-400'
                    )}>
                      {trade.mode ?? 'SIM'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-apex-muted">
                    {trade.openedAt ? new Date(trade.openedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
