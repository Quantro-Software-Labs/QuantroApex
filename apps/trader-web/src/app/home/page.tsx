'use client';

import { AppShell } from '@/components/layout/AppShell';
import { useMe, usePortfolio, useActivityFeed } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

function MetricCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-apex-border bg-apex-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-apex-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-apex-text">{value}</p>
      {sub && (
        <p
          className={cn(
            'mt-0.5 text-sm font-medium',
            positive === true
              ? 'text-apex-success'
              : positive === false
              ? 'text-apex-danger'
              : 'text-apex-muted',
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function AssetClassCard({
  label,
  href,
  value,
  change,
  positive,
  active,
}: {
  label: string;
  href: string;
  value: string;
  change: string;
  positive: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-4 rounded-2xl border border-apex-border bg-apex-surface p-5 transition-all duration-150 hover:border-apex-accent/30 hover:bg-apex-hover"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-apex-muted">{label}</p>
          <p className="mt-1.5 text-xl font-bold text-apex-text">{value}</p>
        </div>
        {active && (
          <span className="flex items-center gap-1.5 rounded-full border border-apex-success/20 bg-apex-success/10 px-2.5 py-1 text-[11px] font-semibold text-apex-success">
            <span className="h-1.5 w-1.5 rounded-full bg-apex-success" />
            Active
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'flex items-center gap-1 text-sm font-medium',
            positive ? 'text-apex-success' : 'text-apex-danger',
          )}
        >
          {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {change}
        </span>
        <ArrowRight
          size={16}
          className="text-apex-muted opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </Link>
  );
}

function ActivityItem({
  title,
  description,
  time,
  pnl,
}: {
  title: string;
  description: string;
  time: string;
  pnl?: number | null;
}) {
  const isPositive = (pnl ?? 0) >= 0;
  return (
    <div className="flex items-start gap-4 border-b border-apex-border py-4 last:border-0">
      <div className="mt-0.5 h-2 w-0.5 shrink-0 self-stretch rounded-full bg-apex-accent/40" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-apex-text">{title}</p>
        <p className="mt-0.5 text-sm text-apex-muted leading-relaxed">{description}</p>
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        {pnl != null && (
          <span
            className={cn(
              'text-sm font-semibold',
              isPositive ? 'text-apex-success' : 'text-apex-danger',
            )}
          >
            {isPositive ? '+' : ''}
            {pnl.toFixed(2)}
          </span>
        )}
        <span className="text-xs text-apex-muted">{time}</span>
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-xl bg-apex-border/30', className)} />
  );
}

export default function HomePage() {
  const { data: profile, isLoading: profileLoading } = useMe();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: feedData, isLoading: feedLoading } = useActivityFeed(1);

  const firstName = profile?.firstName ?? profile?.name?.split(' ')[0] ?? 'Trader';
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const totalValue = portfolio?.totalValue ?? 0;
  const dayPnl = portfolio?.dayPnl ?? 0;
  const dayPnlPct = portfolio?.dayPnlPercent ?? 0;
  const isPositiveDay = dayPnl >= 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Greeting */}
        <div>
          <p className="text-sm text-apex-muted">
            {greeting},{' '}
            {profileLoading ? (
              <span className="inline-block h-4 w-20 animate-pulse rounded bg-apex-border/40" />
            ) : (
              <span className="font-semibold text-apex-text">{firstName}</span>
            )}
          </p>
        </div>

        {/* Portfolio hero with Manual Trading & Advisory CTAs */}
        <div className="rounded-2xl border border-apex-border bg-apex-surface p-6">
          {portfolioLoading ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-12 w-64" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-apex-muted">
                  Total Portfolio Value
                </p>
                <p className="mt-2 font-mono text-5xl font-bold text-apex-text tracking-tight">
                  ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p
                  className={cn(
                    'mt-1.5 flex items-center gap-1.5 text-sm font-medium',
                    isPositiveDay ? 'text-apex-success' : 'text-apex-danger',
                  )}
                >
                  {isPositiveDay ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {isPositiveDay ? '+' : ''}
                  {dayPnl.toFixed(2)} ({isPositiveDay ? '+' : ''}
                  {dayPnlPct.toFixed(2)}%) today
                </p>
              </div>

              {/* First fold quick execution actions */}
              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href="/stocks/trading-desk"
                  className="inline-flex items-center gap-2 rounded-xl bg-apex-accent px-5 py-3 text-xs font-bold text-white shadow-lg shadow-apex-accent/25 hover:bg-blue-600 transition-all hover:scale-[1.02]"
                >
                  <Zap size={15} />
                  <span>Manual Trading Desk</span>
                </Link>
                <Link
                  href="/advisory"
                  className="inline-flex items-center gap-2 rounded-xl border border-apex-border bg-apex-hover/50 px-4 py-3 text-xs font-semibold text-apex-text hover:border-apex-accent/40 transition-all"
                >
                  <span>AI Advisory</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Apex status + quick stats */}
        {!portfolioLoading && (
          <div className="grid grid-cols-3 gap-4">
            <MetricCard
              label="Apex Status"
              value={profile?.agentState?.isActive ? 'Active' : 'Inactive'}
              sub={
                profile?.agentState?.currentStrategy?.name
                  ? `Running ${profile.agentState.currentStrategy.name}`
                  : 'No strategy running'
              }
            />
            <MetricCard
              label="Open Positions"
              value={String(portfolio?.positions?.length ?? 0)}
              sub="across all assets"
            />
            <MetricCard
              label="Total Return"
              value={`${(portfolio?.totalPnlPercent ?? 0) >= 0 ? '+' : ''}${(portfolio?.totalPnlPercent ?? 0).toFixed(2)}%`}
              positive={(portfolio?.totalPnlPercent ?? 0) >= 0}
              sub={`$${(portfolio?.totalPnl ?? 0).toFixed(2)} all time`}
            />
          </div>
        )}
        {portfolioLoading && (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <SkeletonBlock key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        )}

        {/* Asset class cards */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-apex-text">Asset Classes</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <AssetClassCard
              label="Stocks"
              href="/stocks"
              value={`$${(
                portfolio?.positions
                  ?.filter((p) => p.assetClass === 'us_equity')
                  .reduce((s, p) => s + p.marketValue, 0) ?? 0
              ).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              change={`${isPositiveDay ? '+' : ''}${dayPnlPct.toFixed(2)}%`}
              positive={isPositiveDay}
              active={profile?.agentState?.isActive ?? false}
            />
            <AssetClassCard
              label="Crypto"
              href="/crypto"
              value="Coming soon"
              change="—"
              positive={true}
              active={false}
            />
            <AssetClassCard
              label="Forex"
              href="/forex"
              value="Coming soon"
              change="—"
              positive={true}
              active={false}
            />
          </div>
        </div>

        {/* Activity feed */}
        <div className="rounded-2xl border border-apex-border bg-apex-surface p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-apex-text">Recent Activity</h2>
            <Link
              href="/stocks"
              className="flex items-center gap-1 text-xs text-apex-accent hover:text-apex-accent/80 transition-colors"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {feedLoading ? (
            <div className="mt-4 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4">
                  <SkeletonBlock className="mt-1 h-12 w-0.5" />
                  <div className="flex-1 space-y-2">
                    <SkeletonBlock className="h-4 w-48" />
                    <SkeletonBlock className="h-3 w-72" />
                  </div>
                </div>
              ))}
            </div>
          ) : !feedData?.entries?.length ? (
            <div className="py-8 text-center">
              <Zap size={24} className="mx-auto mb-2 text-apex-muted/40" />
              <p className="text-sm text-apex-muted">Apex is monitoring. Activity will appear here.</p>
            </div>
          ) : (
            <div className="mt-2">
              {feedData.entries.slice(0, 8).map((entry) => (
                <ActivityItem
                  key={entry.id}
                  title={entry.title}
                  description={entry.description}
                  time={new Date(entry.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  pnl={entry.pnl}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
