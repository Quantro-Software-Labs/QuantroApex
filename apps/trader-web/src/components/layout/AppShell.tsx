'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useMe } from '@/lib/queries';
import { EmergencyStopBanner } from '@/components/risk/EmergencyStopBanner';
import { cn } from '@/lib/utils';

// Routes where the sidebar auto-collapses to give charts maximum space
const CHART_ROUTES = ['/stocks/trading-desk', '/crypto/trading-desk', '/forex/trading-desk'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: profile } = useMe();

  const isChartRoute = CHART_ROUTES.some((r) => pathname.startsWith(r));
  const [manualCollapse, setManualCollapse] = useState(false);

  // Auto-collapse on chart routes
  const collapsed = isChartRoute || manualCollapse;

  const handleToggle = useCallback(() => {
    setManualCollapse((v) => !v);
  }, []);

  const mode = (profile?.agentState?.mode ?? 'SIMULATION') as 'LIVE' | 'SIMULATION';
  const apexActive = profile?.agentState?.isActive ?? false;

  return (
    <AuthGuard>
      <div className="flex h-screen flex-col overflow-hidden bg-apex-bg">
        {/* Persistent Emergency Stop Banner across all signed-in pages */}
        <EmergencyStopBanner />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar collapsed={collapsed} onToggle={handleToggle} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <Header
              mode={mode}
              apexActive={apexActive}
              onModeToggle={() => {}}
            />

            {/* Simulation mode indicator banner — subtle, quiet confidence */}
            {mode === 'SIMULATION' && (
              <div
                id="sim-mode-banner"
                className="flex items-center justify-center border-b border-apex-border bg-apex-surface/40 py-1"
              >
                <span className="text-[11px] font-medium tracking-wider text-apex-muted uppercase">
                  SIMULATED TRADING — VIRTUAL CAPITAL ONLY
                </span>
              </div>
            )}

            {/* Live mode banner */}
            {mode === 'LIVE' && (
              <div
                id="live-mode-banner"
                className="flex items-center justify-center border-b border-emerald-500/20 bg-emerald-500/10 py-1"
              >
                <span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
                  Live Trading Active — Real Broker Execution
                </span>
              </div>
            )}

            <main
              id="main-content"
              className={cn(
                'flex-1 overflow-y-auto',
                isChartRoute ? 'p-0' : 'p-6',
              )}
            >
              {children}
            </main>

            {/* Persistent regulatory disclaimer footer */}
            <footer
              id="global-disclaimer-footer"
              className="shrink-0 border-t border-apex-border bg-apex-surface/80 px-6 py-2.5 text-center text-xs text-apex-muted"
            >
              Paper trading with simulated money. Not investment advice. Past or simulated results don&apos;t guarantee future returns.
            </footer>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
