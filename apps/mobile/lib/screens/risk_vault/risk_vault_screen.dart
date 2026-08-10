import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/risk_vault_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class RiskVaultScreen extends StatefulWidget {
  const RiskVaultScreen({super.key});

  @override
  State<RiskVaultScreen> createState() => _RiskVaultScreenState();
}

class _RiskVaultScreenState extends State<RiskVaultScreen> {
  final _dailyLossController = TextEditingController();

  double _maxDrawdown = 0.15;
  double _perTradeExposure = 0.05;
  bool _cryptoEnabled = false;
  bool _stocksEnabled = true;
  bool _forexEnabled = false;
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      final vault = context.read<RiskVaultProvider>().vault;
      if (vault != null) {
        _dailyLossController.text = vault.dailyLossLimit.toStringAsFixed(0);
        _maxDrawdown = vault.maxDrawdown;
        _perTradeExposure = vault.perTradeExposure;
        _cryptoEnabled = vault.cryptoEnabled;
        _stocksEnabled = vault.stocksEnabled;
        _forexEnabled = vault.forexEnabled;
        _initialized = true;
      }
    }
  }

  @override
  void dispose() {
    _dailyLossController.dispose();
    super.dispose();
  }

  Future<void> _handleSave() async {
    final limit = double.tryParse(_dailyLossController.text) ?? 500.0;
    final provider = context.read<RiskVaultProvider>();
    final success = await provider.updateVault(
      dailyLossLimit: limit,
      maxDrawdown: _maxDrawdown,
      perTradeExposure: _perTradeExposure,
      cryptoEnabled: _cryptoEnabled,
      stocksEnabled: _stocksEnabled,
      forexEnabled: _forexEnabled,
    );

    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Risk Vault boundaries updated.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RiskVaultProvider>();
    final isStopped = provider.isEmergencyStopped;

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.primary),
        title: Text('Risk Vault', style: AppTypography.h2(color: AppColors.primary)),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.space4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  StatusBadge(
                    label: isStopped ? 'Trading Halted' : 'Enforcement Active',
                    color: isStopped ? AppColors.danger : AppColors.success,
                  ),
                  if (isStopped)
                    GhostButton(
                      label: 'Resume Trading',
                      onPressed: () => provider.resumeTrading(),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.space4),

              Text('Hard Boundaries', style: AppTypography.h1(color: AppColors.primary)),
              const SizedBox(height: AppSpacing.space2),
              Text(
                'Parameters set here are enforced server-side. Apex will not place any trade violating these rules.',
                style: AppTypography.body(color: AppColors.muted),
              ),
              const SizedBox(height: AppSpacing.space5),

              if (provider.errorMessage != null) ...[
                Text(
                  provider.errorMessage!,
                  style: AppTypography.secondary(color: AppColors.danger),
                ),
                const SizedBox(height: AppSpacing.space3),
              ],

              InputField(
                label: 'Daily Loss Limit (\$)',
                controller: _dailyLossController,
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: AppSpacing.space4),

              ApexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Max Drawdown Floor', style: AppTypography.h3(color: AppColors.primary)),
                        Text('${(_maxDrawdown * 100).toStringAsFixed(0)}%', style: AppTypography.h2(color: AppColors.accent)),
                      ],
                    ),
                    Slider(
                      value: _maxDrawdown,
                      min: 0.05,
                      max: 0.35,
                      divisions: 30,
                      activeColor: AppColors.accent,
                      onChanged: (val) => setState(() => _maxDrawdown = val),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space4),

              ApexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Max Per-Trade Exposure', style: AppTypography.h3(color: AppColors.primary)),
                        Text('${(_perTradeExposure * 100).toStringAsFixed(0)}%', style: AppTypography.h2(color: AppColors.accent)),
                      ],
                    ),
                    Slider(
                      value: _perTradeExposure,
                      min: 0.01,
                      max: 0.20,
                      divisions: 19,
                      activeColor: AppColors.accent,
                      onChanged: (val) => setState(() => _perTradeExposure = val),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space4),

              ApexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Asset Class Permissions', style: AppTypography.h3(color: AppColors.primary)),
                    CheckboxListTile(
                      title: Text('US Stocks', style: AppTypography.body(color: AppColors.primary)),
                      value: _stocksEnabled,
                      activeColor: AppColors.accent,
                      onChanged: (val) => setState(() => _stocksEnabled = val ?? true),
                      contentPadding: EdgeInsets.zero,
                    ),
                    CheckboxListTile(
                      title: Text('Cryptocurrency', style: AppTypography.body(color: AppColors.primary)),
                      value: _cryptoEnabled,
                      activeColor: AppColors.accent,
                      onChanged: (val) => setState(() => _cryptoEnabled = val ?? false),
                      contentPadding: EdgeInsets.zero,
                    ),
                    CheckboxListTile(
                      title: Text('Forex', style: AppTypography.body(color: AppColors.primary)),
                      value: _forexEnabled,
                      activeColor: AppColors.accent,
                      onChanged: (val) => setState(() => _forexEnabled = val ?? false),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space5),

              PrimaryButton(
                label: 'Save Boundaries',
                isLoading: provider.isLoading,
                onPressed: _handleSave,
              ),
              const SizedBox(height: AppSpacing.space5),

              // Emergency Stop Action Card
              ApexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Emergency Control', style: AppTypography.h3(color: AppColors.danger)),
                    const SizedBox(height: AppSpacing.space2),
                    Text(
                      'Instantly halts all Apex trading algorithms and cancels active trade orders.',
                      style: AppTypography.secondary(color: AppColors.muted),
                    ),
                    const SizedBox(height: AppSpacing.space3),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: isStopped ? AppColors.muted : AppColors.danger,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        onPressed: isStopped ? null : () => provider.triggerEmergencyStop(),
                        child: Text(
                          isStopped ? 'Emergency Stop Active' : 'STOP ALL ACTIVITY',
                          style: AppTypography.body(color: AppColors.white),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
