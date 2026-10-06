'use client';

import { AppShell } from '@/components/layout/AppShell';
import { useStrategies } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function StrategiesPage() {
  const { data, isLoading } = useStrategies();
  const strategies = data?.strategies ?? [];

  const riskColor = {
    LOW: 'text-apex-success border-apex-success/20 bg-apex-success/10',
    MEDIUM: 'text-amber-400 border-amber-400/20 bg-amber-400/10',
    HIGH: 'text-apex-danger border-apex-danger/20 bg-apex-danger/10',
  } as const;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-apex-text">Strategies</h1>
          <p className="mt-0.5 text-sm text-apex-muted">Curated strategies for Apex to run on your behalf</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-apex-surface border border-apex-border" />
            ))}
          </div>
        ) : !strategies.length ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-apex-border bg-apex-surface">
            <p className="text-sm text-apex-muted">No strategies available yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {strategies.map((s) => (
              <div
                key={s.id}
                className="group flex flex-col gap-4 rounded-2xl border border-apex-border bg-apex-surface p-5 transition-all hover:border-apex-accent/30"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {s.isRecommended && (
                      <span className="inline-block mb-2 rounded-full bg-apex-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-apex-accent">
                        Recommended
                      </span>
                    )}
                    <h3 className="text-sm font-semibold text-apex-text">{s.name}</h3>
                    <p className="mt-1 text-xs text-apex-muted leading-relaxed">{s.description}</p>
                  </div>
                  <span className={cn('ml-3 shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold', riskColor[s.riskLevel])}>
                    {s.riskLevel}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-apex-muted">
                  {s.winRate != null && <span>Win rate: <span className="font-semibold text-apex-success">{(s.winRate * 100).toFixed(0)}%</span></span>}
                  {s.avgReturn != null && <span>Avg return: <span className="font-semibold text-apex-success">+{s.avgReturn.toFixed(1)}%</span></span>}
                  <span>{s.userCount} traders</span>
                </div>

                <button
                  id={`select-strategy-${s.id}`}
                  className="w-full rounded-xl border border-apex-accent/30 bg-apex-accent/10 py-2.5 text-sm font-semibold text-apex-accent transition-all hover:bg-apex-accent hover:text-white"
                >
                  Select Strategy
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
