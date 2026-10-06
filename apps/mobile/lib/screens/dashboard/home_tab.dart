import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/analytics_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/dashboard_provider.dart';
import '../../core/providers/execution_provider.dart';
import '../../core/providers/risk_vault_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/providers/simulation_provider.dart';
import '../../widgets/components.dart';
import '../../widgets/demo_capital_dialog.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/mode_toggle_badge.dart';
import '../../widgets/quantro_logo.dart';
import '../../widgets/skeleton_loaders.dart';
import '../analytics/trade_history_screen.dart';

class HomeTab extends StatelessWidget {
  final VoidCallback onViewActivityTap;

  const HomeTab({
    super.key,
    required this.onViewActivityTap,
  });

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final dashboardProvider = context.watch<DashboardProvider>();
    final executionProvider = context.watch<ExecutionProvider>();
    final riskVaultProvider = context.watch<RiskVaultProvider>();
    final simulationProvider = context.watch<SimulationProvider>();
    final analyticsProvider = context.watch<AnalyticsProvider>();

    final user = authProvider.user;
    final name = user?.firstName != null && user!.firstName!.isNotEmpty
        ? user.firstName
        : (user?.email.split('@').first ?? 'Trader');

    final isEmergencyStopped = riskVaultProvider.isEmergencyStopped;
    final entries = dashboardProvider.entries;
    final totalPortfolioEquity = simulationProvider.equity;

    // Session P&L from live portfolio equity vs default paper starting capital
    const defaultStartingCapital = 100000.0;
    final sessionPnl = totalPortfolioEquity - defaultStartingCapital;
    final sessionPct = defaultStartingCapital > 0 ? (sessionPnl / defaultStartingCapital) * 100 : 0.0;
    final realizedPnl = analyticsProvider.metrics?.totalRealizedPnl ?? simulationProvider.realizedPnl;
    final pnlIsPositive = sessionPnl >= 0;
    final pnlColor = pnlIsPositive ? const Color(0xFF10B981) : AppColors.danger;
    final agentPhase = dashboardProvider.agentState.phase;
    final isApexActive = !isEmergencyStopped && agentPhase != 'HALTED';

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([
          dashboardProvider.initDashboard(),
          executionProvider.fetchExecutionState(),
          simulationProvider.fetchSimulationSummary(),
          analyticsProvider.loadAnalytics(),
        ]);
      },
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.space4, vertical: AppSpacing.space3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Header Bar
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const QuantroLogo(
                  size: 32,
                  showText: true,
                  isDarkBackground: true,
                  isHorizontal: true,
                  showTagline: false,
                ),
                Row(
                  children: [
                    const ModeToggleBadge(),
                    const SizedBox(width: AppSpacing.space2),
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF1E293B)),
                      ),
                      child: IconButton(
                        padding: EdgeInsets.zero,
                        icon: const Icon(Icons.tune_rounded, size: 18, color: Color(0xFF94A3B8)),
                        onPressed: () => DemoCapitalDialog.show(context),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.space4),

            Text('Home', style: AppTypography.h1(color: AppColors.white)),
            const SizedBox(height: AppSpacing.space3),

            // Hero Portfolio Card
            ApexCard(
              padding: AppSpacing.space4,
              backgroundColor: const Color(0xFF0F172A),
              borderColor: const Color(0xFF1E293B),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Welcome, $name',
                        style: AppTypography.secondary(color: const Color(0xFF94A3B8)),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: (isApexActive ? const Color(0xFF10B981) : AppColors.danger)
                              .withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: (isApexActive ? const Color(0xFF2563EB) : AppColors.danger)
                                .withValues(alpha: 0.5),
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: isApexActive ? const Color(0xFF10B981) : AppColors.danger,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              isApexActive ? 'Apex · $agentPhase' : 'Apex Halted',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.space2),

                  // Dynamic Portfolio Value
                  if (executionProvider.isLoading)
                    const SkeletonLoader(width: 200, height: 34, borderRadius: 6)
                  else
                    Text(
                      '\$${totalPortfolioEquity.toStringAsFixed(2)}',
                      style: AppTypography.display(color: AppColors.white).copyWith(
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                  const SizedBox(height: 6),

                  Row(
                    children: [
                      Icon(
                        pnlIsPositive ? Icons.arrow_drop_up_rounded : Icons.arrow_drop_down_rounded,
                        color: pnlColor,
                        size: 20,
                      ),
                      Text(
                        'Session P&L: ${pnlIsPositive ? '+' : ''}\$${sessionPnl.toStringAsFixed(2)} '
                        '(${pnlIsPositive ? '+' : ''}${sessionPct.toStringAsFixed(2)}%)',
                        style: AppTypography.body(color: pnlColor).copyWith(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Realized P&L: ${realizedPnl >= 0 ? '+' : ''}\$${realizedPnl.toStringAsFixed(2)}',
                    style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                  ),
                  const SizedBox(height: AppSpacing.space3),
                  const Divider(color: Color(0xFF1E293B), height: 1),
                  const SizedBox(height: AppSpacing.space3),

                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isEmergencyStopped ? AppColors.warning : const Color(0xFF10B981),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        isEmergencyStopped
                            ? 'Trading paused · Risk Vault emergency stop'
                            : 'Apex running · Risk Vault watching',
                        style: AppTypography.caption(
                          color: isEmergencyStopped
                              ? AppColors.warning
                              : const Color(0xFF10B981),
                        ).copyWith(fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.space4),

            // Recent Activity Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Recent Activity', style: AppTypography.h2(color: AppColors.white)),
                GestureDetector(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (context) => const TradeHistoryScreen()),
                    );
                  },
                  child: Text(
                    'Full Trade Log',
                    style: AppTypography.caption(color: const Color(0xFF3B82F6)).copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.space3),

            // Dynamic Activity Log / Skeletons / Empty State
            if (dashboardProvider.isLoading)
              Column(
                children: const [
                  SkeletonListTile(),
                  SkeletonListTile(),
                  SkeletonListTile(),
                ],
              )
            else if (entries.isEmpty)
              const EmptyStateWidget(
                icon: Icons.history_rounded,
                title: 'No Recent Activity Yet',
                description: 'Apex will log execution trades, signal alerts, and strategy updates here as they occur.',
              )
            else
              ...entries.take(5).map((entry) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.space2),
                  child: ApexCard(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E293B),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Center(
                            child: Icon(Icons.bolt_rounded, color: Color(0xFF3B82F6), size: 22),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                entry.message,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 3),
                              Text(
                                '${entry.createdAt.hour.toString().padLeft(2, '0')}:${entry.createdAt.minute.toString().padLeft(2, '0')}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            const SizedBox(height: AppSpacing.space4),

            PrimaryButton(
              label: 'View Activity Feed',
              onPressed: onViewActivityTap,
            ),
            const SizedBox(height: AppSpacing.space4),
          ],
        ),
      ),
    );
  }
}
