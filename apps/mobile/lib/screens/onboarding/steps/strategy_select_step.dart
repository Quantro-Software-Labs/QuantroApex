import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/providers/onboarding_provider.dart';
import '../../../core/providers/strategy_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../widgets/components.dart';
import '../../../widgets/skeleton_loaders.dart';

class StrategySelectStep extends StatefulWidget {
  const StrategySelectStep({super.key});

  @override
  State<StrategySelectStep> createState() => _StrategySelectStepState();
}

class _StrategySelectStepState extends State<StrategySelectStep> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<StrategyProvider>();
      if (provider.recommendedStrategies.isEmpty) {
        provider.loadMarketplace();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final onboardingProvider = context.watch<OnboardingProvider>();
    final strategyProvider = context.watch<StrategyProvider>();
    final selectedId = onboardingProvider.selectedStrategyId;
    final strategies = strategyProvider.recommendedStrategies.isNotEmpty
        ? strategyProvider.recommendedStrategies
        : strategyProvider.strategies;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Curated Recommendations', style: AppTypography.secondary(color: AppColors.muted)),
          const SizedBox(height: AppSpacing.space2),
          Text('Choose Starting Strategy', style: AppTypography.h1(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'Select a seed strategy for Apex to execute. As Apex learns, it refines entry timing and positioning.',
            style: AppTypography.body(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.space5),

          if (strategyProvider.isLoading && strategies.isEmpty)
            const Column(
              children: [
                SkeletonListTile(),
                SkeletonListTile(),
                SkeletonListTile(),
              ],
            )
          else if (strategies.isEmpty)
            ApexCard(
              child: Text(
                strategyProvider.errorMessage ?? 'No strategies available right now.',
                style: AppTypography.body(color: AppColors.muted),
              ),
            )
          else
            ...strategies.take(5).map((strat) {
              final isSelected = selectedId == strat.id;

              return Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.space4),
                child: GestureDetector(
                  onTap: () => onboardingProvider.selectStrategy(strat.id),
                  child: Container(
                    padding: const EdgeInsets.all(AppSpacing.space4),
                    decoration: BoxDecoration(
                      color: AppColors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? AppColors.accent : AppColors.border,
                        width: isSelected ? 2 : 1,
                      ),
                      boxShadow: const [
                        BoxShadow(color: Color(0x0A000000), blurRadius: 2, offset: Offset(0, 1)),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                StatusBadge(
                                  label: strat.assetClass,
                                  color: AppColors.accentMid,
                                ),
                                const SizedBox(width: AppSpacing.space2),
                                StatusBadge(
                                  label: strat.riskLevel,
                                  color: AppColors.muted,
                                ),
                              ],
                            ),
                            if (isSelected)
                              const Icon(Icons.check_circle, color: AppColors.accent, size: 24),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.space3),
                        Text(strat.name, style: AppTypography.h2(color: AppColors.primary)),
                        const SizedBox(height: AppSpacing.space2),
                        Text(
                          strat.description,
                          style: AppTypography.secondary(color: AppColors.muted),
                        ),
                        const SizedBox(height: AppSpacing.space3),
                        Text(
                          '${strat.activeUserCount} active users',
                          style: AppTypography.caption(color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}
