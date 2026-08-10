import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/providers/onboarding_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../widgets/components.dart';

class StrategySelectStep extends StatelessWidget {
  const StrategySelectStep({super.key});

  static const List<Map<String, dynamic>> _strategies = [
    {
      'id': 'strat_momentum_alpha',
      'name': 'Apex Momentum Alpha',
      'description': 'Identifies medium-term trend accelerations in large-cap stocks with strict stop-loss rules.',
      'riskLevel': 'GROWTH',
      'assetClass': 'STOCKS',
      'userCount': 1420,
    },
    {
      'id': 'strat_conservative_yield',
      'name': 'Conservative Yield & Trend',
      'description': 'Focuses on low-volatility assets and defensive position sizing to preserve capital.',
      'riskLevel': 'CONSERVATIVE',
      'assetClass': 'STOCKS',
      'userCount': 2150,
    },
    {
      'id': 'strat_multi_asset',
      'name': 'Multi-Asset Volatility Capture',
      'description': 'Trades momentum shifts across equity indices and major crypto assets.',
      'riskLevel': 'AGGRESSIVE',
      'assetClass': 'MULTI-ASSET',
      'userCount': 890,
    },
  ];

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OnboardingProvider>();
    final selectedId = provider.selectedStrategyId;

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

          ..._strategies.map((strat) {
            final isSelected = selectedId == strat['id'];

            return Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.space4),
              child: GestureDetector(
                onTap: () => provider.selectStrategy(strat['id'] as String),
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
                                label: strat['assetClass'] as String,
                                color: AppColors.accentMid,
                              ),
                              const SizedBox(width: AppSpacing.space2),
                              StatusBadge(
                                label: strat['riskLevel'] as String,
                                color: AppColors.muted,
                              ),
                            ],
                          ),
                          if (isSelected)
                            const Icon(Icons.check_circle, color: AppColors.accent, size: 24),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.space3),
                      Text(strat['name'] as String, style: AppTypography.h2(color: AppColors.primary)),
                      const SizedBox(height: AppSpacing.space2),
                      Text(
                        strat['description'] as String,
                        style: AppTypography.secondary(color: AppColors.muted),
                      ),
                      const SizedBox(height: AppSpacing.space3),
                      Text(
                        '${strat['userCount']} active users',
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
