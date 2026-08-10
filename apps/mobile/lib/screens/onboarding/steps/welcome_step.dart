import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../widgets/components.dart';

class WelcomeStep extends StatelessWidget {
  const WelcomeStep({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: AppSpacing.space4),
          const StatusBadge(label: 'Autonomous Intelligence', color: AppColors.accent),
          const SizedBox(height: AppSpacing.space4),
          Text('Welcome to QuantroApex', style: AppTypography.h1(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space4),
          ApexCard(
            padding: AppSpacing.space4,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '"QuantroApex is an AI that trades on your behalf, learns from every trade, and gets smarter over time. You set the boundaries. It handles the rest."',
                  style: AppTypography.body(color: AppColors.primary),
                ),
                const SizedBox(height: AppSpacing.space3),
                Text(
                  'No fine-print surprises. No manual chart monitoring required.',
                  style: AppTypography.secondary(color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.space5),
          Text('What happens next:', style: AppTypography.h3(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space3),
          _FeatureBullet(
            number: '1',
            title: 'Risk Vault First',
            subtitle: 'You set strict stop-loss and capital boundaries that Apex cannot cross.',
          ),
          const SizedBox(height: AppSpacing.space3),
          _FeatureBullet(
            number: '2',
            title: 'Strategy Matching',
            subtitle: 'We recommend proven algorithmic strategies based on your risk style.',
          ),
          const SizedBox(height: AppSpacing.space3),
          _FeatureBullet(
            number: '3',
            title: 'Complete Control',
            subtitle: 'Toggle between paper trading simulation and live trading at any time.',
          ),
        ],
      ),
    );
  }
}

class _FeatureBullet extends StatelessWidget {
  const _FeatureBullet({
    required this.number,
    required this.title,
    required this.subtitle,
  });

  final String number;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: const BoxDecoration(
            color: AppColors.surface,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              number,
              style: AppTypography.caption(color: AppColors.accent),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.space3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AppTypography.h3(color: AppColors.primary)),
              const SizedBox(height: AppSpacing.space1),
              Text(subtitle, style: AppTypography.secondary(color: AppColors.muted)),
            ],
          ),
        ),
      ],
    );
  }
}
