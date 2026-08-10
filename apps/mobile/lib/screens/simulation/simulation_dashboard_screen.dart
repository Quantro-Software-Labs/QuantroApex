import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/simulation_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import '../../widgets/mode_toggle_badge.dart';

class SimulationDashboardScreen extends StatelessWidget {
  const SimulationDashboardScreen({super.key});

  void _showResetDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: AppColors.white,
          title: Text('Reset Paper Account?', style: AppTypography.h2(color: AppColors.primary)),
          content: Text(
            'This will clear all simulated positions, cancel paper orders, and restore your balance to \$100,000.00.',
            style: AppTypography.body(color: AppColors.primary),
          ),
          actions: [
            GhostButton(
              label: 'Cancel',
              onPressed: () => Navigator.of(dialogContext).pop(),
            ),
            PrimaryButton(
              label: 'Reset Account',
              onPressed: () async {
                Navigator.of(dialogContext).pop();
                final provider = context.read<SimulationProvider>();
                final success = await provider.resetSimulation();
                if (success && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Paper trading account reset to \$100,000.00.')),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SimulationProvider>();

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.primary),
        title: Text('Simulation Mode', style: AppTypography.h2(color: AppColors.primary)),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: AppSpacing.space3),
            child: Center(child: ModeToggleBadge()),
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => provider.fetchSimulationSummary(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.space4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Paper Trading Engine', style: AppTypography.h1(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space1),
                Text(
                  'Risk-free sandbox testing environment with live market simulation feeds.',
                  style: AppTypography.secondary(color: AppColors.muted),
                ),
                const SizedBox(height: AppSpacing.space4),

                MetricTile(
                  label: 'Simulated Equity',
                  value: '\$${provider.equity.toStringAsFixed(2)}',
                  valueColor: provider.realizedPnl >= 0 ? AppColors.success : AppColors.danger,
                ),
                const SizedBox(height: AppSpacing.space3),

                Row(
                  children: [
                    Expanded(
                      child: MetricTile(
                        label: 'Cash Balance',
                        value: '\$${provider.cashBalance.toStringAsFixed(2)}',
                      ),
                    ),
                    const SizedBox(width: AppSpacing.space3),
                    Expanded(
                      child: MetricTile(
                        label: 'Open Positions',
                        value: provider.positionsCount.toString(),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.space5),

                ApexCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Simulated Feed Control', style: AppTypography.h3(color: AppColors.primary)),
                          const StatusBadge(label: 'ACTIVE FEED', color: AppColors.success),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.space2),
                      Text(
                        'Trigger artificial price ticks to test automated strategy responses and risk checks.',
                        style: AppTypography.secondary(color: AppColors.muted),
                      ),
                      const SizedBox(height: AppSpacing.space4),
                      SecondaryButton(
                        label: 'Generate Simulated Market Tick',
                        onPressed: () async {
                          final res = await provider.generateTicks();
                          if (res != null && context.mounted) {
                            final tick = res['tick'] as Map<String, dynamic>;
                            final executed = res['tradeExecuted'] as bool;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Generated ${tick['symbol']} tick @ \$${tick['price']}${executed ? ' · Trade Executed!' : ''}',
                                ),
                              ),
                            );
                          }
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space5),

                Text('Account Management', style: AppTypography.h2(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space3),
                ApexCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Reset Paper Capital', style: AppTypography.h3(color: AppColors.primary)),
                      const SizedBox(height: AppSpacing.space1),
                      Text(
                        'Wipe all paper trades, open positions, and restore starting balance to \$100,000.00.',
                        style: AppTypography.secondary(color: AppColors.muted),
                      ),
                      const SizedBox(height: AppSpacing.space4),
                      PrimaryButton(
                        label: 'Reset Paper Account (\$100,000)',
                        isLoading: provider.isResetting,
                        onPressed: () => _showResetDialog(context),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
