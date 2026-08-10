import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/providers/onboarding_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../widgets/components.dart';

class CapitalStep extends StatefulWidget {
  const CapitalStep({super.key});

  @override
  State<CapitalStep> createState() => _CapitalStepState();
}

class _CapitalStepState extends State<CapitalStep> {
  late TextEditingController _capitalController;

  @override
  void initState() {
    super.initState();
    final provider = context.read<OnboardingProvider>();
    _capitalController = TextEditingController(
      text: provider.tradingCapital.toStringAsFixed(0),
    );
  }

  @override
  void dispose() {
    _capitalController.dispose();
    super.dispose();
  }

  void _presetCapital(double val) {
    _capitalController.text = val.toStringAsFixed(0);
    context.read<OnboardingProvider>().setCapital(val);
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OnboardingProvider>();

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Capital Allocation', style: AppTypography.secondary(color: AppColors.muted)),
          const SizedBox(height: AppSpacing.space2),
          Text('Set Your Trading Capital', style: AppTypography.h1(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'The initial capital amount Apex uses for position sizing and Risk Vault calculations.',
            style: AppTypography.body(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.space5),

          InputField(
            label: 'Trading Capital Amount (\$)',
            controller: _capitalController,
            keyboardType: TextInputType.number,
            validator: (val) {
              if (val == null || double.tryParse(val) == null) return 'Enter a valid amount';
              return null;
            },
          ),
          const SizedBox(height: AppSpacing.space4),

          Text('Quick presets:', style: AppTypography.secondary(color: AppColors.muted)),
          const SizedBox(height: AppSpacing.space2),
          Row(
            children: [
              _CapitalChip(
                label: '\$2,500',
                isSelected: provider.tradingCapital == 2500,
                onTap: () => _presetCapital(2500),
              ),
              const SizedBox(width: AppSpacing.space2),
              _CapitalChip(
                label: '\$10,000',
                isSelected: provider.tradingCapital == 10000,
                onTap: () => _presetCapital(10000),
              ),
              const SizedBox(width: AppSpacing.space2),
              _CapitalChip(
                label: '\$25,000',
                isSelected: provider.tradingCapital == 25000,
                onTap: () => _presetCapital(25000),
              ),
              const SizedBox(width: AppSpacing.space2),
              _CapitalChip(
                label: '\$100,000',
                isSelected: provider.tradingCapital == 100000,
                onTap: () => _presetCapital(100000),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.space5),

          const ApexCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.info_outline, color: AppColors.accent, size: 20),
                    SizedBox(width: AppSpacing.space2),
                    Text('Paper Trading Notice', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.primary)),
                  ],
                ),
                SizedBox(height: AppSpacing.space2),
                Text(
                  'Every account includes \$100,000 in paper trading (Simulation mode) by default. You can test your strategy before connecting real capital.',
                  style: TextStyle(fontSize: 14, color: AppColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CapitalChip extends StatelessWidget {
  const _CapitalChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text(
        label,
        style: AppTypography.secondary(
          color: isSelected ? AppColors.white : AppColors.primary,
        ),
      ),
      backgroundColor: isSelected ? AppColors.accent : AppColors.surface,
      onPressed: onTap,
    );
  }
}
