import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/providers/onboarding_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../widgets/components.dart';

class HowApexLearnsStep extends StatelessWidget {
  const HowApexLearnsStep({super.key});

  @override
  Widget build(BuildContext context) {
    final onboardingProvider = context.watch<OnboardingProvider>();

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Two-Layer Intelligence', style: AppTypography.secondary(color: AppColors.muted)),
          const SizedBox(height: AppSpacing.space2),
          Text('How Apex Learns & Evolves', style: AppTypography.h1(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'QuantroApex combines market-wide intelligence with your individual trading preferences.',
            style: AppTypography.body(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.space5),

          const ApexCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.public, color: AppColors.accent, size: 20),
                    SizedBox(width: AppSpacing.space2),
                    Text('Global Brain', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.primary)),
                  ],
                ),
                SizedBox(height: AppSpacing.space2),
                Text(
                  'A foundation model pre-trained on 10+ years of historical market data across Crypto, Stocks, and Forex. It recognizes macro patterns and market regimes.',
                  style: TextStyle(fontSize: 14, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.space4),

          const ApexCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.person_outline, color: AppColors.accentMid, size: 20),
                    SizedBox(width: AppSpacing.space2),
                    Text('Personal Agent', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.primary)),
                  ],
                ),
                SizedBox(height: AppSpacing.space2),
                Text(
                  'Your dedicated instance. It fine-tunes on your trade history, risk boundaries, and asset preferences — adapting specifically to your goals.',
                  style: TextStyle(fontSize: 14, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.space5),

          ApexCard(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Collective Data Contribution', style: AppTypography.h3(color: AppColors.primary)),
                      const SizedBox(height: AppSpacing.space1),
                      Text(
                        'Allow anonymized trade outcomes to help retrain the Global Brain.',
                        style: AppTypography.secondary(color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: onboardingProvider.globalBrainConsent,
                  activeColor: AppColors.accent,
                  onChanged: (val) => onboardingProvider.setGlobalBrainConsent(val),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
