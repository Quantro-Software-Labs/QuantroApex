'use client';

import { useState } from 'react';
import { X, ShieldAlert, AlertTriangle } from 'lucide-react';
import { User } from '@/lib/queries';

interface LiveModeConfirmModalProps {
  isOpen: boolean;
  userProfile?: User;
  onClose: () => void;
  onConfirm: () => void;
}

export function LiveModeConfirmModal({
  isOpen,
  userProfile,
  onClose,
  onConfirm,
}: LiveModeConfirmModalProps) {
  const [typedConfirmation, setTypedConfirmation] = useState('');

  if (!isOpen) return null;

  const kycVerified = userProfile?.kycVerification?.status === 'VERIFIED';
  const brokerConnected =
    Boolean(userProfile?.profile?.isBrokerConnected) ||
    Boolean(userProfile?.profile?.alpacaApiKey);

  const canSwitch = kycVerified && brokerConnected;
  const isInputValid = typedConfirmation.trim().toUpperCase() === 'LIVE';

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!isInputValid || !canSwitch) return;
    setTypedConfirmation('');
    onConfirm();
    onClose();
  }

  function handleClose() {
    setTypedConfirmation('');
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-apex-border bg-apex-surface p-6 shadow-xl">
        <button
          onClick={handleClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-apex-muted transition-colors hover:bg-apex-hover hover:text-apex-text"
        >
          <X size={18} />
        </button>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-apex-warning/30 bg-apex-warning/10 text-apex-warning">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 id="live-confirm-title" className="text-base font-bold text-apex-text">
                Switch to Live Trading
              </h2>
              <p className="text-xs text-apex-muted">Real capital execution verification</p>
            </div>
          </div>

          {!kycVerified && (
            <div className="rounded-xl border border-apex-danger/30 bg-apex-danger/10 p-3.5 text-xs text-apex-danger">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={14} />
                <span>KYC Verification Required</span>
              </div>
              <p className="mt-1 text-apex-muted">
                Live trading requires verified identity. Please complete KYC verification before enabling live mode.
              </p>
            </div>
          )}

          {!brokerConnected && (
            <div className="rounded-xl border border-apex-danger/30 bg-apex-danger/10 p-3.5 text-xs text-apex-danger">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={14} />
                <span>Broker API Keys Required</span>
              </div>
              <p className="mt-1 text-apex-muted">
                Please connect your broker credentials in Settings &gt; Broker Keys before switching to Live Mode.
              </p>
            </div>
          )}

          {canSwitch && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <p className="text-xs text-apex-muted leading-relaxed">
                You are about to switch to Live Execution mode. Trades placed will be routed to your real broker account with real capital.
              </p>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-apex-muted">
                  Type <span className="font-mono text-apex-warning font-bold">LIVE</span> to confirm
                </label>
                <input
                  id="live-mode-type-confirm-input"
                  type="text"
                  value={typedConfirmation}
                  onChange={(e) => setTypedConfirmation(e.target.value)}
                  placeholder="LIVE"
                  autoFocus
                  className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-apex-text outline-none focus:border-apex-warning"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-apex-border px-4 py-2 text-xs font-semibold text-apex-muted hover:bg-apex-hover hover:text-apex-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="confirm-switch-to-live-btn"
                  disabled={!isInputValid}
                  className="rounded-xl bg-apex-warning px-5 py-2 text-xs font-bold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Confirm Live Mode
                </button>
              </div>
            </form>
          )}

          {!canSwitch && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl border border-apex-border px-4 py-2 text-xs font-semibold text-apex-text hover:bg-apex-hover"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
