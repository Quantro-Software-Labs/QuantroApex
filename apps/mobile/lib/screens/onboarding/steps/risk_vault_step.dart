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
          Text('Protection First', style: AppTypography.secondary(color: AppColors.muted)),
          const SizedBox(height: AppSpacing.space2),
          Text('Risk Vault Setup', style: AppTypography.h1(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'Set strict capital boundaries. Apex cannot cross these limits under any market conditions.',
            style: AppTypography.body(color: AppColors.muted),
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
                    Text('Maximum Drawdown Floor', style: AppTypography.h3(color: AppColors.primary)),
                    Text(
                      '${(provider.maxDrawdown * 100).toStringAsFixed(0)}%',
                      style: AppTypography.h2(color: AppColors.accent),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.space1),
                Text(
                  'Maximum allowable portfolio drawdown before Apex halts execution.',
                  style: AppTypography.secondary(color: AppColors.muted),
                ),
                Slider(
                  value: provider.maxDrawdown,
                  min: 0.05,
                  max: 0.35,
                  divisions: 30,
                  activeColor: AppColors.accent,
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
                Text('Permitted Asset Classes', style: AppTypography.h3(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space2),
                CheckboxListTile(
                  title: Text('US Stocks & ETFs', style: AppTypography.body(color: AppColors.primary)),
                  subtitle: Text('Alpaca broker execution', style: AppTypography.caption(color: AppColors.muted)),
                  value: provider.stocksEnabled,
                  activeColor: AppColors.accent,
                  onChanged: (val) => provider.setRiskVault(stocksEnabled: val ?? true),
                  contentPadding: EdgeInsets.zero,
                ),
                CheckboxListTile(
                  title: Text('Cryptocurrency', style: AppTypography.body(color: AppColors.primary)),
                  subtitle: Text('Spot BTC & ETH trading', style: AppTypography.caption(color: AppColors.muted)),
                  value: provider.cryptoEnabled,
                  activeColor: AppColors.accent,
                  onChanged: (val) => provider.setRiskVault(cryptoEnabled: val ?? false),
                  contentPadding: EdgeInsets.zero,
                ),
                CheckboxListTile(
                  title: Text('Forex Pairs', style: AppTypography.body(color: AppColors.primary)),
                  subtitle: Text('Major currency pairs', style: AppTypography.caption(color: AppColors.muted)),
                  value: provider.forexEnabled,
                  activeColor: AppColors.accent,
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
