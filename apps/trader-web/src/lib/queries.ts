/**
 * React Query hooks for all API calls.
 * Query keys are centralised here so cache invalidation is consistent.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  firstName: string | null;
  lastName: string | null;
  experienceLevel: 'NEWCOMER' | 'INTERMEDIATE' | 'PROFESSIONAL';
  preferredMarket: string;
  onboardingCompletedAt: string | null;
  profile: {
    globalBrainConsent: boolean;
    alpacaApiKey?: string | null;
    alpacaSecretKey?: string | null;
    isBrokerConnected?: boolean;
  } | null;
  agentState: AgentState | null;
  subscription: Subscription | null;
  kycVerification: KycVerification | null;
  onboardingProgress: OnboardingProgress | null;
}

export interface AgentState {
  id: string;
  isActive: boolean;
  mode: 'LIVE' | 'SIMULATION';
  phase: string;
  capitalAllocated: number;
  currentStrategy: {
    id: string;
    name: string;
    slug: string;
    assetClass: string;
    riskLevel: string;
    description: string;
  } | null;
}

export interface Subscription {
  id: string;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
}

export interface KycVerification {
  id: string;
  status: string;
  level: string;
}

export interface OnboardingProgress {
  id: string;
  completedAt: string | null;
  currentStep: number;
}

export interface ActivityEntry {
  id: string;
  type: string;
  title: string;
  description: string;
  assetClass: string | null;
  amount: number | null;
  pnl: number | null;
  createdAt: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  dayPnl: number;
  dayPnlPercent: number;
  positions: Position[];
}

export interface Position {
  symbol: string;
  qty: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  assetClass: string;
}

export interface Strategy {
  id: string;
  name: string;
  slug: string;
  description: string;
  assetClass: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  timeframe: string;
  winRate: number | null;
  avgReturn: number | null;
  userCount: number;
  isRecommended: boolean;
}

export interface AnalyticsData {
  equityCurve: { date: string; value: number }[];
  winRate: number;
  totalTrades: number;
  avgHoldTime: number;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  trades: Trade[];
}

export interface Trade {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  qty: number;
  entryPrice: number;
  exitPrice: number | null;
  pnl: number | null;
  status: string;
  mode: 'LIVE' | 'SIMULATION';
  openedAt: string;
  closedAt: string | null;
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const queryKeys = {
  me: ['me'] as const,
  activityFeed: (page: number) => ['activity-feed', page] as const,
  portfolio: ['portfolio'] as const,
  strategies: (assetClass?: string) => ['strategies', assetClass] as const,
  analytics: (assetClass: string) => ['analytics', assetClass] as const,
  agentState: ['agent-state'] as const,
  notifications: ['notifications'] as const,
} as const;

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await api.get<User>('/auth/me');
      } catch {
        return {
          id: 'guest',
          name: 'Trader',
          firstName: 'Trader',
          lastName: '',
          email: 'demo@quantroapex.app',
          phone: null,
          experienceLevel: 'INTERMEDIATE',
          preferredMarket: 'STOCKS',
          onboardingCompletedAt: new Date().toISOString(),
          profile: { globalBrainConsent: true },
          agentState: {
            id: 'sim_state',
            isActive: true,
            mode: 'SIMULATION',
            phase: 'SCOPED_EDGE',
            capitalAllocated: 10000,
            currentStrategy: null,
          },
          subscription: { id: 'sub_core', plan: 'CORE', status: 'ACTIVE', currentPeriodEnd: null },
          kycVerification: { id: 'kyc_demo', status: 'VERIFIED', level: 'basic' },
          onboardingProgress: { id: 'ob_demo', completedAt: new Date().toISOString(), currentStep: 4 },
        } as User;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useActivityFeed(page = 1) {
  return useQuery({
    queryKey: queryKeys.activityFeed(page),
    queryFn: async () => {
      try {
        return await api.get<{ entries: ActivityEntry[]; total: number }>(
          `/activity-feed?page=${page}&limit=20`,
        );
      } catch {
        return { entries: [], total: 0 };
      }
    },
    staleTime: 30_000,
  });
}

export function usePortfolio() {
  return useQuery({
    queryKey: queryKeys.portfolio,
    queryFn: async () => {
      try {
        const raw = await api.get<any>('/execution/positions');
        const p = raw?.portfolio ?? raw ?? {};
        const totalValue = p?.equity ?? p?.totalValue ?? p?.cashBalance ?? 100000;
        const totalPnl = p?.totalPnl ?? 0;
        const totalPnlPercent = p?.totalPnlPercent ?? 0;
        const dayPnl = p?.dayPnl ?? 0;
        const dayPnlPercent = p?.dayPnlPercent ?? 0;
        const positions = p?.positions ?? raw?.positions ?? [];
        return {
          totalValue,
          totalPnl,
          totalPnlPercent,
          dayPnl,
          dayPnlPercent,
          positions,
        } as PortfolioSummary;
      } catch {
        return {
          totalValue: 100000.00,
          totalPnl: 0.00,
          totalPnlPercent: 0.00,
          dayPnl: 0.00,
          dayPnlPercent: 0.00,
          positions: [],
        } as PortfolioSummary;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000, // refresh every minute
  });
}

export function useStrategies(assetClass?: string) {
  const qs = assetClass ? `?assetClass=${assetClass}` : '';
  return useQuery({
    queryKey: queryKeys.strategies(assetClass),
    queryFn: () => api.get<{ strategies: Strategy[] }>(`/strategies${qs}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAnalytics(assetClass: string) {
  return useQuery({
    queryKey: queryKeys.analytics(assetClass),
    queryFn: () => api.get<AnalyticsData>(`/analytics?assetClass=${assetClass}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User>) => api.patch<User>('/auth/profile', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useToggleApex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { action: 'start' | 'stop' }) =>
      api.post('/execution/apex/toggle', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.me });
      qc.invalidateQueries({ queryKey: queryKeys.agentState });
    },
  });
}

export function useToggleMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: 'LIVE' | 'SIMULATION') =>
      api.post('/execution/mode', { mode }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.me });
      qc.invalidateQueries({ queryKey: queryKeys.agentState });
    },
  });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      symbol: string;
      side: 'buy' | 'sell';
      qty?: number;
      notional?: number;
      orderType: 'market' | 'limit';
      limitPrice?: number;
      timeInForce?: string;
    }) => api.post('/execution/orders', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.portfolio });
      qc.invalidateQueries({ queryKey: queryKeys.activityFeed(1) });
    },
  });
}
