import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/simulation_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import '../../widgets/demo_capital_dialog.dart';
import '../../widgets/mode_toggle_badge.dart';
import '../../widgets/calm_feedback.dart';

class SimulationDashboardScreen extends StatelessWidget {
  const SimulationDashboardScreen({super.key});

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
                            showCalmSnackBar(
                              context,
                              executed
                                  ? 'Simulated ${tick['symbol']} at \$${tick['price']} — a trade filled.'
                                  : 'Simulated ${tick['symbol']} at \$${tick['price']}.',
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
                      Text('Configure Demo Capital', style: AppTypography.h3(color: AppColors.primary)),
                      const SizedBox(height: AppSpacing.space1),
                      Text(
                        'Choose a preset amount (\$5k, \$10k, \$25k, \$50k, \$100k) or enter a custom demo starting balance.',
                        style: AppTypography.secondary(color: AppColors.muted),
                      ),
                      const SizedBox(height: AppSpacing.space4),
                      PrimaryButton(
                        label: 'Set Custom / Preset Demo Capital',
                        isLoading: provider.isResetting,
                        onPressed: () => DemoCapitalDialog.show(context),
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
