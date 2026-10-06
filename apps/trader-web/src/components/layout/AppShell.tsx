'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useMe, useToggleMode } from '@/lib/queries';
import { BrokerConnectModal } from '@/components/broker/BrokerConnectModal';
import { cn } from '@/lib/utils';

// Routes where the sidebar auto-collapses to give charts maximum space
const CHART_ROUTES = ['/stocks/trading-desk', '/crypto/trading-desk', '/forex/trading-desk'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: profile } = useMe();
  const toggleModeMutation = useToggleMode();
  const [showBrokerModal, setShowBrokerModal] = useState(false);

  const isChartRoute = CHART_ROUTES.some((r) => pathname.startsWith(r));
  const [manualCollapse, setManualCollapse] = useState(false);

  // Auto-collapse on chart routes
  const collapsed = isChartRoute || manualCollapse;

  const handleToggle = useCallback(() => {
    setManualCollapse((v) => !v);
  }, []);

  const handleModeToggle = useCallback(() => {
    const current = profile?.agentState?.mode ?? 'SIMULATION';
    if (current === 'SIMULATION') {
      const isBrokerConnected =
        profile?.profile?.isBrokerConnected ||
        Boolean(profile?.profile?.alpacaApiKey);
      
      if (!isBrokerConnected) {
        setShowBrokerModal(true);
        return;
      }
      toggleModeMutation.mutate('LIVE');
    } else {
      toggleModeMutation.mutate('SIMULATION');
    }
  }, [profile, toggleModeMutation]);

  const handleBrokerConnectSuccess = useCallback(() => {
    toggleModeMutation.mutate('LIVE');
  }, [toggleModeMutation]);

  const mode = (profile?.agentState?.mode ?? 'SIMULATION') as 'LIVE' | 'SIMULATION';
  const apexActive = profile?.agentState?.isActive ?? false;

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-apex-bg">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />

        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            mode={mode}
            apexActive={apexActive}
            onModeToggle={handleModeToggle}
          />

          {/* Simulation mode badge — subtle, non-intrusive */}
          {mode === 'SIMULATION' && (
            <div className="flex items-center justify-center border-b border-amber-500/20 bg-amber-500/5 py-1">
              <span className="text-[11px] font-medium tracking-wider text-amber-400/80 uppercase">
                Simulation Mode — no real capital at risk
              </span>
            </div>
          )}

          {/* Live mode badge */}
          {mode === 'LIVE' && (
            <div className="flex items-center justify-center border-b border-emerald-500/20 bg-emerald-500/10 py-1">
              <span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
                Live Trading Active — real broker execution enabled
              </span>
            </div>
          )}

          <BrokerConnectModal
            isOpen={showBrokerModal}
            onClose={() => setShowBrokerModal(false)}
            onConnectSuccess={handleBrokerConnectSuccess}
          />

          <main
            id="main-content"
            className={cn(
              'flex-1 overflow-y-auto',
              // Chart routes get zero padding so chart fills edge-to-edge
              isChartRoute ? 'p-0' : 'p-6',
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
