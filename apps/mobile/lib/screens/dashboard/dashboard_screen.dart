import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/dashboard_provider.dart';
import '../../core/providers/risk_vault_provider.dart';
import '../../core/providers/simulation_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import '../../widgets/demo_capital_dialog.dart';
import '../../widgets/mode_toggle_badge.dart';
import '../../widgets/quantro_logo.dart';
import '../analytics/analytics_screen.dart';
import '../execution/execution_controls_screen.dart';
import '../notifications/advisory_feed_screen.dart';
import '../notifications/notification_settings_screen.dart';
import '../risk_vault/risk_vault_screen.dart';
import '../simulation/simulation_dashboard_screen.dart';
import '../strategies/strategy_marketplace_screen.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final dashboardProvider = context.watch<DashboardProvider>();
    final riskVaultProvider = context.watch<RiskVaultProvider>();
    final simulationProvider = context.watch<SimulationProvider>();

    final user = authProvider.user;
    final name = user?.firstName != null && user!.firstName!.isNotEmpty
        ? user.firstName
        : user?.email ?? 'Trader';

    final agentState = dashboardProvider.agentState;
    final entries = dashboardProvider.entries;
    final activeStrategy = dashboardProvider.activeStrategyName ?? 'No Active Strategy Selected';
    final isEmergencyStopped = riskVaultProvider.isEmergencyStopped;

    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            await Future.wait([
              dashboardProvider.initDashboard(),
              simulationProvider.fetchSimulationSummary(),
            ]);
          },
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.space4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Bar
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const QuantroLogo(size: 32, showText: false),
                        const SizedBox(width: AppSpacing.space3),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Good day, $name', style: AppTypography.secondary(color: AppColors.muted)),
                            const SizedBox(height: AppSpacing.space1),
                            Text('QuantroApex', style: AppTypography.h1(color: AppColors.primary)),
                          ],
                        ),
                      ],
                    ),
                    const ModeToggleBadge(),
                  ],
                ),
                const SizedBox(height: AppSpacing.space4),

                // Agent Status Card
                ApexCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Apex Autonomous Agent', style: AppTypography.h3(color: AppColors.primary)),
                          StatusBadge(
                            label: isEmergencyStopped ? 'Paused' : agentState.phase,
                            color: isEmergencyStopped ? AppColors.warning : AppColors.accent,
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.space3),
                      Text(
                        'Active Strategy: $activeStrategy',
                        style: AppTypography.body(color: AppColors.primary),
                      ),
                      const SizedBox(height: AppSpacing.space2),
                      Row(
                        children: [
                          Text(
                            'Confidence: ${(agentState.confidenceScore * 100).toStringAsFixed(0)}%',
                            style: AppTypography.caption(color: AppColors.muted),
                          ),
                          const SizedBox(width: AppSpacing.space3),
                          Text(
                            'Executed Trades: ${agentState.tradeCount}',
                            style: AppTypography.caption(color: AppColors.muted),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space4),

                // Portfolio Metric & Demo Capital Controls
                ApexCard(
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                simulationProvider.activeMode == 'LIVE' ? 'Live Broker Equity' : 'Simulated Equity',
                                style: AppTypography.caption(color: AppColors.muted),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '\$${simulationProvider.equity.toStringAsFixed(2)}',
                                style: AppTypography.h1(
                                  color: simulationProvider.realizedPnl >= 0 ? AppColors.success : AppColors.danger,
                                ),
                              ),
                            ],
                          ),
                          if (simulationProvider.activeMode != 'LIVE')
                            ElevatedButton.icon(
                              onPressed: () => DemoCapitalDialog.show(context),
                              icon: const Icon(Icons.tune, size: 16),
                              label: const Text('Set Demo Capital'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF1E293B),
                                foregroundColor: const Color(0xFF3B82F6),
                                elevation: 0,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space4),

                // Live Activity Feed
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Activity & Trade Feed', style: AppTypography.h2(color: AppColors.primary)),
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppColors.success,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'LIVE STREAM',
                          style: AppTypography.caption(color: AppColors.success)
                              .copyWith(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.space3),

                if (dashboardProvider.isLoading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(AppSpacing.space4),
                      child: CircularProgressIndicator(color: AppColors.accent),
                    ),
                  )
                else if (entries.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.space3),
                    child: Text(
                      'No activity logged yet. Apex will log events in plain English as signals execute.',
                      style: AppTypography.secondary(color: AppColors.muted),
                    ),
                  )
                else
                  ...entries.take(8).map((entry) {
                    final isDanger = entry.eventType == 'EMERGENCY_STOP' || entry.eventType == 'RISK_LIMIT_HIT';
                    final isSuccess = entry.eventType == 'TRADE_OPENED' || entry.eventType == 'TRADE_CLOSED';

                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.space2),
                      child: ActivityFeedEntry(
                        message: entry.message,
                        timestamp: _formatTime(entry.createdAt),
                        accentColor: isDanger
                            ? AppColors.danger
                            : (isSuccess ? AppColors.accent : AppColors.muted),
                      ),
                    );
                  }),

                const SizedBox(height: AppSpacing.space5),

                // Action Navigation Shortcuts
                PrimaryButton(
                  label: 'Browse Strategy Marketplace',
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (context) => const StrategyMarketplaceScreen()),
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.space3),
                SecondaryButton(
                  label: 'Performance & Analytics',
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (context) => const AnalyticsScreen()),
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.space3),
                SecondaryButton(
                  label: 'Simulation & Paper Trading',
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (context) => const SimulationDashboardScreen()),
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.space3),
                SecondaryButton(
                  label: 'Advisory Mode Signals',
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (context) => const AdvisoryFeedScreen()),
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.space3),
                GhostButton(
                  label: 'Notification Preferences',
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (context) => const NotificationSettingsScreen()),
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.space2),
                GhostButton(
                  label: 'Execution Controls (Alpaca Engine)',
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (context) => const ExecutionControlsScreen()),
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.space2),
                GhostButton(
                  label: 'Risk Vault Settings',
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (context) => const RiskVaultScreen()),
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.space5),
                GhostButton(
                  label: 'Log Out',
                  onPressed: () => context.read<AuthProvider>().logout(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatTime(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${date.day}/${date.month}';
  }
}
