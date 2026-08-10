import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/providers/onboarding_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';

class PaperTradingPromptStep extends StatelessWidget {
  const PaperTradingPromptStep({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OnboardingProvider>();
    final isSim = provider.preferredMode == 'SIM';

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Execution Mode', style: AppTypography.secondary(color: AppColors.muted)),
          const SizedBox(height: AppSpacing.space2),
          Text('Start in Simulation or Live?', style: AppTypography.h1(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'Paper trading lets Apex observe live market data and execute paper trades using virtual funds.',
            style: AppTypography.body(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.space5),

          _ModeChoiceCard(
            title: 'Start in Simulation Mode (Recommended)',
            subtitle: 'Uses \$100,000 virtual balance. Mirrors live spreads and slippage. Switch to Live trading at any time.',
            isSelected: isSim,
            onTap: () => provider.setCapital(provider.tradingCapital, mode: 'SIM'),
          ),
          const SizedBox(height: AppSpacing.space4),

          _ModeChoiceCard(
            title: 'Start with Live Trading',
            subtitle: 'Executes trades with real capital via your connected Alpaca broker account.',
            isSelected: !isSim,
            onTap: () => provider.setCapital(provider.tradingCapital, mode: 'LIVE'),
          ),
        ],
      ),
    );
  }
}

class _ModeChoiceCard extends StatelessWidget {
  const _ModeChoiceCard({
    required this.title,
    required this.subtitle,
    required this.isSelected,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
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
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              isSelected ? Icons.check_circle : Icons.circle_outlined,
              color: isSelected ? AppColors.accent : AppColors.muted,
              size: 24,
            ),
            const SizedBox(width: AppSpacing.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppTypography.h3(color: AppColors.primary)),
                  const SizedBox(height: AppSpacing.space2),
                  Text(subtitle, style: AppTypography.secondary(color: AppColors.muted)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
