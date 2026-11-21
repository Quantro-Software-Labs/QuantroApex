'use client';

import { useState } from 'react';
import { AlertOctagon, RefreshCw, Loader2 } from 'lucide-react';
import { useRiskVault, useResumeTrading } from '@/lib/queries';

export function EmergencyStopBanner() {
  const { data: riskVault } = useRiskVault('STOCKS');
  const resumeTrading = useResumeTrading('STOCKS');
  const [error, setError] = useState<string | null>(null);

  if (!riskVault?.emergencyStop) return null;

  const queuedCount = riskVault.queuedClosesCount ?? 0;
  const cannotReset = queuedCount > 0;

  async function handleReset() {
    setError(null);
    try {
      await resumeTrading.mutateAsync();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to reset emergency stop.');
    }
  }

  return (
    <div
      id="emergency-stop-banner"
      role="alert"
      className="sticky top-0 z-40 border-b border-apex-danger/40 bg-apex-danger/15 px-4 py-2.5 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-apex-danger/40 bg-apex-danger/20 text-apex-danger">
            <AlertOctagon size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-apex-danger">
                Emergency Stop Active
              </span>
              <span className="text-[11px] text-apex-muted">•</span>
              <span className="text-xs text-apex-text">
                All order execution and automated agent trading are suspended.
              </span>
            </div>
            {cannotReset && (
              <p className="mt-0.5 text-[11px] text-apex-warning">
                {queuedCount} market-open close order(s) pending. Emergency stop stays active until queued orders fill.
              </p>
            )}
            {error && (
              <p className="mt-0.5 text-[11px] text-apex-danger">{error}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            id="reset-emergency-stop-btn"
            onClick={handleReset}
            disabled={cannotReset || resumeTrading.isPending}
            title={
              cannotReset
                ? 'Cannot reset while queued market-open closes are pending'
                : 'Resume trading execution'
            }
            className="flex items-center gap-1.5 rounded-lg border border-apex-border bg-apex-surface px-3 py-1.5 text-xs font-semibold text-apex-text transition-all hover:bg-apex-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {resumeTrading.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            <span>Reset Emergency Stop</span>
          </button>
        </div>
      </div>
    </div>
  );
}
