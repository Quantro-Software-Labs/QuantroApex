'use client';

import { AppShell } from '@/components/layout/AppShell';
import { TradingDeskLayout } from '@/components/trading/TradingDeskLayout';

export default function TradingDeskPage() {
  return (
    <AppShell>
      <TradingDeskLayout />
    </AppShell>
  );
}
