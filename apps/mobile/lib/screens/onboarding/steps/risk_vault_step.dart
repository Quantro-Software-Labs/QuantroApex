import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/providers/onboarding_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../widgets/components.dart';

class RiskVaultStep extends StatefulWidget {
  const RiskVaultStep({super.key});

  @override
  State<RiskVaultStep> createState() => _RiskVaultStepState();
}

class _RiskVaultStepState extends State<RiskVaultStep> {
  late TextEditingController _dailyLossController;

  @override
  void initState() {
    super.initState();
    final provider = context.read<OnboardingProvider>();
    _dailyLossController = TextEditingController(
      text: provider.dailyLossLimit.toStringAsFixed(0),
    );
    _dailyLossController.addListener(() {
      final val = double.tryParse(_dailyLossController.text);
      if (val != null && val > 0) {
        context.read<OnboardingProvider>().setRiskVault(dailyLossLimit: val);
      }
    });
  }

  @override
  void dispose() {
    _dailyLossController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OnboardingProvider>();

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Protection First', style: AppTypography.secondary(color: const Color(0xFF94A3B8))),
          const SizedBox(height: AppSpacing.space2),
          Text('Risk Vault Setup', style: AppTypography.h1(color: AppColors.white)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'Set strict capital boundaries. Apex cannot cross these limits under any market conditions.',
            style: AppTypography.body(color: const Color(0xFF94A3B8)),
          ),
          const SizedBox(height: AppSpacing.space5),

          InputField(
            label: 'Daily Loss Limit (\$)',
            controller: _dailyLossController,
            keyboardType: TextInputType.number,
            validator: (val) => null,
          ),
          const SizedBox(height: AppSpacing.space4),

          ApexCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Maximum Drawdown Floor', style: AppTypography.h3(color: AppColors.white)),
                    Text(
                      '${(provider.maxDrawdown * 100).toStringAsFixed(0)}%',
                      style: AppTypography.h2(color: const Color(0xFF3B82F6)),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.space1),
                Text(
                  'Maximum allowable portfolio drawdown before Apex halts execution.',
                  style: AppTypography.secondary(color: const Color(0xFF94A3B8)),
                ),
                Slider(
                  value: provider.maxDrawdown,
                  min: 0.05,
                  max: 0.35,
                  divisions: 30,
                  activeColor: const Color(0xFF3B82F6),
                  onChanged: (val) => provider.setRiskVault(maxDrawdown: val),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.space4),

          ApexCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Permitted Asset Classes', style: AppTypography.h3(color: AppColors.white)),
                const SizedBox(height: AppSpacing.space2),
                CheckboxListTile(
                  title: Text('Global Equities', style: AppTypography.body(color: AppColors.white)),
                  subtitle: Text('Alpaca broker execution', style: AppTypography.caption(color: const Color(0xFF64748B))),
                  value: provider.stocksEnabled,
                  activeColor: const Color(0xFF3B82F6),
                  onChanged: (val) => provider.setRiskVault(stocksEnabled: val ?? true),
                  contentPadding: EdgeInsets.zero,
                ),
                CheckboxListTile(
                  title: Text('Cryptocurrency', style: AppTypography.body(color: AppColors.white)),
                  subtitle: Text('Spot BTC & ETH trading', style: AppTypography.caption(color: const Color(0xFF64748B))),
                  value: provider.cryptoEnabled,
                  activeColor: const Color(0xFF3B82F6),
                  onChanged: (val) => provider.setRiskVault(cryptoEnabled: val ?? false),
                  contentPadding: EdgeInsets.zero,
                ),
                CheckboxListTile(
                  title: Text('Forex Pairs', style: AppTypography.body(color: AppColors.white)),
                  subtitle: Text('Major currency pairs', style: AppTypography.caption(color: const Color(0xFF64748B))),
                  value: provider.forexEnabled,
                  activeColor: const Color(0xFF3B82F6),
                  onChanged: (val) => provider.setRiskVault(forexEnabled: val ?? false),
                  contentPadding: EdgeInsets.zero,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
