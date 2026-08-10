import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/providers/onboarding_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../widgets/components.dart';

class OnboardingCompleteStep extends StatelessWidget {
  const OnboardingCompleteStep({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OnboardingProvider>();

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: AppSpacing.space4),
          const StatusBadge(label: 'Setup Complete', color: AppColors.success),
          const SizedBox(height: AppSpacing.space4),
          Text("You're Set", style: AppTypography.h1(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'Apex is active and monitoring the markets according to your configured boundaries.',
            style: AppTypography.body(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.space5),

          ApexCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Configuration Summary', style: AppTypography.h3(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space3),
                _SummaryRow(
                  label: 'Experience Path',
                  value: provider.path == 'EXPRESS' ? 'Express Setup' : 'Newcomer Guided',
                ),
                const Divider(),
                _SummaryRow(
                  label: 'Trading Mode',
                  value: provider.preferredMode == 'SIM' ? 'Simulation (Paper)' : 'Live Trading',
                ),
                const Divider(),
                _SummaryRow(
                  label: 'Daily Loss Limit',
                  value: '\$${provider.dailyLossLimit.toStringAsFixed(0)}',
                ),
                const Divider(),
                _SummaryRow(
                  label: 'Max Drawdown Floor',
                  value: '${(provider.maxDrawdown * 100).toStringAsFixed(0)}%',
                ),
                const Divider(),
                _SummaryRow(
                  label: 'Global Brain Learning',
                  value: provider.globalBrainConsent ? 'Opted In' : 'Opted Out',
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.space5),

          if (provider.errorMessage != null) ...[
            Text(
              provider.errorMessage!,
              style: AppTypography.secondary(color: AppColors.danger),
            ),
            const SizedBox(height: AppSpacing.space3),
          ],

          PrimaryButton(
            label: 'Enter Dashboard',
            isLoading: provider.isSubmitting,
            onPressed: () async {
              final success = await provider.submitCompletion();
              if (success && context.mounted) {
                await context.read<AuthProvider>().checkAuthStatus();
              }
            },
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.space1),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AppTypography.secondary(color: AppColors.muted)),
          Text(value, style: AppTypography.body(color: AppColors.primary)),
        ],
      ),
    );
  }
}
