import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/strategy_provider.dart';
import '../../core/services/strategy_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class StrategyDetailBottomSheet extends StatelessWidget {
  const StrategyDetailBottomSheet({
    super.key,
    required this.strategy,
  });

  final StrategyData strategy;

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<StrategyProvider>();
    final bt = strategy.backtestSummary;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.space4),
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: Color(0xFF1E293B))),
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.space3),

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  StatusBadge(label: strategy.assetClass, color: const Color(0xFF2563EB)),
                  StatusBadge(label: strategy.riskLevel, color: const Color(0xFF64748B)),
                ],
              ),
              const SizedBox(height: AppSpacing.space3),

              Text(strategy.name, style: AppTypography.h1(color: AppColors.white)),
              const SizedBox(height: AppSpacing.space1),
              Text(
                '${strategy.activeUserCount} active traders currently running this strategy',
                style: AppTypography.caption(color: const Color(0xFF64748B)),
              ),
              const SizedBox(height: AppSpacing.space4),

              Text(strategy.description, style: AppTypography.body(color: AppColors.white)),
              const SizedBox(height: AppSpacing.space4),

              Text('Historical Performance', style: AppTypography.h3(color: AppColors.white)),
              const SizedBox(height: AppSpacing.space2),
              Row(
                children: [
                  Expanded(
                    child: MetricTile(
                      label: 'Win Rate',
                      value: '${(bt.winRate * 100).toStringAsFixed(0)}%',
                      valueColor: const Color(0xFF10B981),
                    ),
                  ),
                  Expanded(
                    child: MetricTile(
                      label: 'Annual Return',
                      value: '${(bt.annualizedReturn * 100).toStringAsFixed(1)}%',
                      valueColor: AppColors.white,
                    ),
                  ),
                  Expanded(
                    child: MetricTile(
                      label: 'Sharpe Ratio',
                      value: bt.sharpeRatio.toStringAsFixed(2),
                      valueColor: AppColors.white,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.space4),

              ApexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Execution Rules', style: AppTypography.h3(color: AppColors.white)),
                    const SizedBox(height: AppSpacing.space2),
                    Text(
                      'Entry: ${strategy.rules['entryCondition'] ?? 'Pattern recognition'}',
                      style: AppTypography.secondary(color: const Color(0xFF94A3B8)),
                    ),
                    const SizedBox(height: AppSpacing.space1),
                    Text(
                      'Exit: ${strategy.rules['exitCondition'] ?? 'Trailing stop limit'}',
                      style: AppTypography.secondary(color: const Color(0xFF94A3B8)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space5),

              PrimaryButton(
                label: 'Start Apex with this Strategy',
                isLoading: provider.isSelecting,
                onPressed: () async {
                  final success = await provider.activateStrategy(strategy.id);
                  if (success && context.mounted) {
                    Navigator.of(context).pop();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Activated strategy: ${strategy.name}'),
                        backgroundColor: const Color(0xFF10B981),
                      ),
                    );
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
