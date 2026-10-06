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
    _capitalController.addListener(() {
      final val = double.tryParse(_capitalController.text);
      if (val != null && val > 0) {
        context.read<OnboardingProvider>().setCapital(val);
      }
    });
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
          Text('Capital Allocation', style: AppTypography.secondary(color: const Color(0xFF94A3B8))),
          const SizedBox(height: AppSpacing.space2),
          Text('Set Your Trading Capital', style: AppTypography.h1(color: AppColors.white)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'The initial capital amount Apex uses for position sizing and Risk Vault calculations.',
            style: AppTypography.body(color: const Color(0xFF94A3B8)),
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

          Text('Quick presets:', style: AppTypography.secondary(color: const Color(0xFF94A3B8))),
          const SizedBox(height: AppSpacing.space2),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _CapitalChip(
                label: '\$1,000',
                isSelected: provider.tradingCapital == 1000,
                onTap: () => _presetCapital(1000),
              ),
              _CapitalChip(
                label: '\$2,500',
                isSelected: provider.tradingCapital == 2500,
                onTap: () => _presetCapital(2500),
              ),
              _CapitalChip(
                label: '\$5,000',
                isSelected: provider.tradingCapital == 5000,
                onTap: () => _presetCapital(5000),
              ),
              _CapitalChip(
                label: '\$10,000',
                isSelected: provider.tradingCapital == 10000,
                onTap: () => _presetCapital(10000),
              ),
              _CapitalChip(
                label: '\$25,000',
                isSelected: provider.tradingCapital == 25000,
                onTap: () => _presetCapital(25000),
              ),
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
                    Icon(Icons.shield_outlined, color: Color(0xFF3B82F6), size: 20),
                    SizedBox(width: AppSpacing.space2),
                    Text('Disciplined Demo Practice', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.white)),
                  ],
                ),
                SizedBox(height: AppSpacing.space2),
                Text(
                  'Set your demo starting capital to the realistic amount you plan to trade with live. Practicing with your target capital builds disciplined risk habits.',
                  style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
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
          color: isSelected ? AppColors.white : const Color(0xFF94A3B8),
        ),
      ),
      backgroundColor: isSelected ? const Color(0xFF2563EB) : const Color(0xFF0F172A),
      onPressed: onTap,
    );
  }
}
