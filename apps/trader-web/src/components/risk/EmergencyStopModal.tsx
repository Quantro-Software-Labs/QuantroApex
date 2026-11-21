'use client';

import { useState } from 'react';
import { AlertOctagon, X, Loader2, CheckCircle2 } from 'lucide-react';
import { useEmergencyStop, EmergencyStopResult } from '@/lib/queries';

interface EmergencyStopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EmergencyStopModal({ isOpen, onClose }: EmergencyStopModalProps) {
  const [result, setResult] = useState<EmergencyStopResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emergencyStopMutation = useEmergencyStop();

  if (!isOpen) return null;

  async function handleConfirm() {
    setError(null);
    try {
      const res = await emergencyStopMutation.mutateAsync();
      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to trigger emergency stop.');
    }
  }

  function handleClose() {
    setResult(null);
    setError(null);
    onClose();
  }

  const queuedClosesCount =
    result?.closedPositions.filter((p) => p.status === 'QUEUED').length ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-stop-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-apex-border bg-apex-surface p-6 shadow-xl">
        <button
          onClick={handleClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-apex-muted transition-colors hover:bg-apex-hover hover:text-apex-text"
        >
          <X size={18} />
        </button>

        {!result ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-apex-danger/30 bg-apex-danger/10 text-apex-danger">
                <AlertOctagon size={22} />
              </div>
              <div>
                <h2 id="emergency-stop-title" className="text-base font-bold text-apex-text">
                  Confirm Emergency Stop
                </h2>
                <p className="text-xs text-apex-muted">Halt all automated and manual trading</p>
              </div>
            </div>

            <p className="text-sm text-apex-muted leading-relaxed">
              Triggering an Emergency Stop will immediately:
            </p>

            <ul className="space-y-2 text-xs text-apex-text">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-apex-danger" />
                <span>Cancel all active open and pending limit orders.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-apex-danger" />
                <span>
                  Close open positions immediately, or queue them for market open if outside regular hours.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-apex-danger" />
                <span>
                  Lock trading execution until an explicit manual reset is performed after all queued closes resolve.
                </span>
              </li>
            </ul>

            {error && (
              <div className="rounded-xl border border-apex-danger/30 bg-apex-danger/10 p-3 text-xs text-apex-danger">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={emergencyStopMutation.isPending}
                className="rounded-xl border border-apex-border px-4 py-2.5 text-xs font-semibold text-apex-muted hover:bg-apex-hover hover:text-apex-text"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-emergency-stop-btn"
                onClick={handleConfirm}
                disabled={emergencyStopMutation.isPending}
                className="flex items-center gap-2 rounded-xl bg-apex-danger px-5 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {emergencyStopMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <AlertOctagon size={14} />
                )}
                {emergencyStopMutation.isPending ? 'Executing Stop…' : 'Activate Emergency Stop'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-apex-warning/30 bg-apex-warning/10 text-apex-warning">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h2 id="emergency-stop-title" className="text-base font-bold text-apex-text">
                  Emergency Stop Activated
                </h2>
                <p className="text-xs text-apex-muted">
                  Trading is suspended. Execution engine locked.
                </p>
              </div>
            </div>

            {/* Results breakdown */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-apex-border bg-apex-bg p-3">
                <p className="text-apex-muted">Cancelled Orders</p>
                <p className="mt-1 text-base font-bold text-apex-text">
                  {result.summary.cancelledOrdersCount}
                </p>
              </div>
              <div className="rounded-xl border border-apex-border bg-apex-bg p-3">
                <p className="text-apex-muted">Closed Positions</p>
                <p className="mt-1 text-base font-bold text-apex-text">
                  {result.summary.closedPositionsCount}
                </p>
              </div>
              <div className="rounded-xl border border-apex-border bg-apex-bg p-3">
                <p className="text-apex-muted">Queued for Open</p>
                <p className="mt-1 text-base font-bold text-apex-warning">
                  {queuedClosesCount}
                </p>
              </div>
              <div className="rounded-xl border border-apex-border bg-apex-bg p-3">
                <p className="text-apex-muted">Failed Closes / Cancels</p>
                <p className="mt-1 text-base font-bold text-apex-muted">
                  {result.summary.failedClosesCount + result.summary.failedCancelsCount}
                </p>
              </div>
            </div>

            <p className="text-xs text-apex-muted">
              {queuedClosesCount > 0
                ? `${queuedClosesCount} position(s) are queued for fill at regular market open. Emergency stop will remain active and cannot be reset until queued closes complete.`
                : 'All open orders and positions have been resolved. Emergency stop remains active until you explicitly reset it.'}
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                id="emergency-stop-done-btn"
                onClick={handleClose}
                className="rounded-xl bg-apex-accent px-5 py-2.5 text-xs font-semibold text-white hover:bg-apex-accent/90"
              >
                Acknowledge & Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
