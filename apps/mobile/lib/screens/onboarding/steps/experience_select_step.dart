import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/providers/onboarding_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';

class ExperienceSelectStep extends StatelessWidget {
  const ExperienceSelectStep({super.key});

  @override
  Widget build(BuildContext context) {
    final onboardingProvider = context.watch<OnboardingProvider>();
    final selectedPath = onboardingProvider.path;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Welcome to Apex', style: AppTypography.secondary(color: AppColors.muted)),
          const SizedBox(height: AppSpacing.space2),
          Text('Choose your experience path', style: AppTypography.h1(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'We tailor the interface, tooltips, and setup depth to your trading experience.',
            style: AppTypography.body(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.space5),

          _PathOptionCard(
            title: "I'm new to this",
            subtitle: "Full 9-step guided walkthrough. Plain-English explanations, risk quiz, and strategy recommendations.",
            isSelected: selectedPath == 'NEWCOMER',
            onTap: () => onboardingProvider.selectPath('NEWCOMER'),
          ),
          const SizedBox(height: AppSpacing.space4),

          _PathOptionCard(
            title: "I'm an experienced trader",
            subtitle: "Express 4-step setup. Direct Risk Vault parameter entry, strategy selection, and capital setup.",
            isSelected: selectedPath == 'EXPRESS',
            onTap: () => onboardingProvider.selectPath('EXPRESS'),
          ),
        ],
      ),
    );
  }
}

class _PathOptionCard extends StatelessWidget {
  const _PathOptionCard({
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
              isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: isSelected ? AppColors.accent : AppColors.muted,
              size: 24,
            ),
            const SizedBox(width: AppSpacing.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppTypography.h2(color: AppColors.primary)),
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
