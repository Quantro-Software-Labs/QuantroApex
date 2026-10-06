'use client';

import { useState } from 'react';
import { X, ShieldCheck, Key, Lock, Loader2, ArrowRight } from 'lucide-react';
import { useUpdateProfile } from '@/lib/queries';

interface BrokerConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectSuccess: () => void;
}

export function BrokerConnectModal({
  isOpen,
  onClose,
  onConnectSuccess,
}: BrokerConnectModalProps) {
  const [broker, setBroker] = useState<'alpaca' | 'oanda' | 'binance'>('alpaca');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateProfile = useUpdateProfile();

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || !apiSecret.trim()) {
      setError('Please enter both your Broker API Key and Secret Key.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Save credentials and mark broker connected
      await updateProfile.mutateAsync({
        profile: {
          globalBrainConsent: true,
          isBrokerConnected: true,
          alpacaApiKey: apiKey.trim(),
          alpacaSecretKey: apiSecret.trim(),
        },
      } as any);

      onConnectSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to connect broker. Please check your credentials.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-apex-border bg-apex-surface p-6 shadow-2xl shadow-black/80">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-apex-muted transition-colors hover:bg-apex-hover hover:text-apex-text"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-apex-text">Connect Broker for Live Execution</h3>
            <p className="text-xs text-apex-muted">Required before switching to Live Mode</p>
          </div>
        </div>

        <p className="mt-4 text-xs text-apex-muted leading-relaxed">
          QuantroApex is non-custodial. Your funds stay safe inside your broker account. Connect your API keys below so Apex can execute trades on your behalf when Live Mode is active.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Broker Selector */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-apex-muted">
              Select Broker / Exchange
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setBroker('alpaca')}
                className="rounded-xl border p-2.5 text-left text-xs font-semibold border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span>Alpaca</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </div>
                <span className="block text-[10px] font-normal text-apex-muted mt-0.5">US Stocks</span>
              </button>
              <button
                type="button"
                disabled
                className="rounded-xl border border-apex-border/40 bg-apex-bg/40 p-2.5 text-left text-xs font-semibold text-apex-muted/50 cursor-not-allowed opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span>OANDA</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-apex-muted/60">SOON</span>
                </div>
                <span className="block text-[10px] font-normal text-apex-muted/50 mt-0.5">Forex</span>
              </button>
              <button
                type="button"
                disabled
                className="rounded-xl border border-apex-border/40 bg-apex-bg/40 p-2.5 text-left text-xs font-semibold text-apex-muted/50 cursor-not-allowed opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span>Binance</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-apex-muted/60">SOON</span>
                </div>
                <span className="block text-[10px] font-normal text-apex-muted/50 mt-0.5">Crypto</span>
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-apex-muted/80">
              Only Stock broker execution (Alpaca) is active today under the SCOPED_EDGE live trading policy.
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-apex-muted">
              API Key ({broker.toUpperCase()})
            </label>
            <div className="relative">
              <Key size={16} className="absolute left-3.5 top-3.5 text-apex-muted" />
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="e.g. PK2U6432ALU7PXWOR4G..."
                className="w-full rounded-xl border border-apex-border bg-apex-bg pl-10 pr-4 py-2.5 text-xs font-mono text-apex-text outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
          </div>

          {/* API Secret */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-apex-muted">
              API Secret Key
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-3.5 text-apex-muted" />
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••"
                className="w-full rounded-xl border border-apex-border bg-apex-bg pl-10 pr-4 py-2.5 text-xs font-mono text-apex-text outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-medium text-apex-danger">{error}</p>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-apex-border px-4 py-2 text-xs font-semibold text-apex-muted hover:bg-apex-hover hover:text-apex-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-black transition-all hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? 'Connecting…' : 'Save Broker & Enable Live'}
              {!saving && <ArrowRight size={14} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
