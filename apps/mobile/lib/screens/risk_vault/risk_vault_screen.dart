import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/risk_vault_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import '../../widgets/calm_feedback.dart';

class RiskVaultScreen extends StatefulWidget {
  final bool isTab;

  const RiskVaultScreen({
    super.key,
    this.isTab = false,
  });

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
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<RiskVaultProvider>();
      if (provider.vault == null) {
        provider.fetchVault();
      }
    });
  }

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
      showCalmSnackBar(context, 'Risk Vault boundaries updated.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RiskVaultProvider>();
    final isStopped = provider.isEmergencyStopped;

    Widget content = SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.space4, vertical: AppSpacing.space3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Risk Vault', style: AppTypography.h1(color: AppColors.white)),
              StatusBadge(
                label: isStopped ? 'Trading Halted' : 'Enforcement Active',
                color: isStopped ? const Color(0xFFEF4444) : const Color(0xFF10B981),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'Parameters set here are enforced server-side. Apex cannot cross these rules under any market condition.',
            style: AppTypography.body(color: const Color(0xFF94A3B8)),
          ),
          const SizedBox(height: AppSpacing.space4),

          if (isStopped) ...[
            ApexCard(
              backgroundColor: const Color(0xFF1C1917),
              borderColor: const Color(0xFF92400E),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Expanded(
                    child: Text(
                      'Trading is paused. Resume when you are ready.',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w500,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF10B981),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: () => provider.resumeTrading(),
                    child: const Text('Resume'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.space4),
          ],

          if (provider.errorMessage != null) ...[
            Text(
              provider.errorMessage!,
              style: AppTypography.secondary(color: const Color(0xFFEF4444)),
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
                    Text('Maximum Drawdown Floor', style: AppTypography.h3(color: AppColors.white)),
                    Text('${(_maxDrawdown * 100).toStringAsFixed(0)}%', style: AppTypography.h2(color: const Color(0xFF3B82F6))),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Portfolio drawdown threshold before circuit breaker halts trading.',
                  style: AppTypography.caption(color: const Color(0xFF64748B)),
                ),
                Slider(
                  value: _maxDrawdown,
                  min: 0.05,
                  max: 0.35,
                  divisions: 30,
                  activeColor: const Color(0xFF3B82F6),
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
                    Text('Max Per-Trade Exposure', style: AppTypography.h3(color: AppColors.white)),
                    Text('${(_perTradeExposure * 100).toStringAsFixed(0)}%', style: AppTypography.h2(color: const Color(0xFF3B82F6))),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Maximum size per position relative to total portfolio capital.',
                  style: AppTypography.caption(color: const Color(0xFF64748B)),
                ),
                Slider(
                  value: _perTradeExposure,
                  min: 0.01,
                  max: 0.20,
                  divisions: 19,
                  activeColor: const Color(0xFF3B82F6),
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
                Text('Asset Class Permissions', style: AppTypography.h3(color: AppColors.white)),
                CheckboxListTile(
                  title: Text('Global Equities', style: AppTypography.body(color: AppColors.white)),
                  value: _stocksEnabled,
                  activeColor: const Color(0xFF3B82F6),
                  onChanged: (val) => setState(() => _stocksEnabled = val ?? true),
                  contentPadding: EdgeInsets.zero,
                ),
                CheckboxListTile(
                  title: Text('Cryptocurrency', style: AppTypography.body(color: AppColors.white)),
                  value: _cryptoEnabled,
                  activeColor: const Color(0xFF3B82F6),
                  onChanged: (val) => setState(() => _cryptoEnabled = val ?? false),
                  contentPadding: EdgeInsets.zero,
                ),
                CheckboxListTile(
                  title: Text('Forex Pairs', style: AppTypography.body(color: AppColors.white)),
                  value: _forexEnabled,
                  activeColor: const Color(0xFF3B82F6),
                  onChanged: (val) => setState(() => _forexEnabled = val ?? false),
                  contentPadding: EdgeInsets.zero,
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.space5),

          PrimaryButton(
            label: 'Save Risk Boundaries',
            isLoading: provider.isLoading,
            onPressed: _handleSave,
          ),
          const SizedBox(height: AppSpacing.space5),

          // Circuit Breaker Panic Button Card
          ApexCard(
            backgroundColor: const Color(0xFF180A0A),
            borderColor: const Color(0xFF7F1D1D),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Circuit Breaker (Panic Button)', style: AppTypography.h3(color: const Color(0xFFEF4444))),
                const SizedBox(height: AppSpacing.space2),
                Text(
                  'Instantly halts all Apex trading algorithms and cancels active pending orders.',
                  style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                ),
                const SizedBox(height: AppSpacing.space3),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isStopped ? const Color(0xFF334155) : const Color(0xFFB45309),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: isStopped
                        ? null
                        : () {
                            showDialog(
                              context: context,
                              builder: (context) => AlertDialog(
                                backgroundColor: const Color(0xFF0F172A),
                                title: const Text(
                                  'Pause all trading?',
                                  style: TextStyle(color: Colors.white),
                                ),
                                content: const Text(
                                  'Automated and live orders will stop until you resume. Your positions stay as they are.',
                                  style: TextStyle(color: Color(0xFF94A3B8)),
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(context),
                                    child: const Text(
                                      'Keep trading',
                                      style: TextStyle(color: Color(0xFF94A3B8)),
                                    ),
                                  ),
                                  ElevatedButton(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFFB45309),
                                    ),
                                    onPressed: () {
                                      Navigator.pop(context);
                                      provider.triggerEmergencyStop();
                                    },
                                    child: const Text(
                                      'Pause trading',
                                      style: TextStyle(color: Colors.white),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                    child: Text(
                      isStopped ? 'Trading paused' : 'Pause all trading',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.space4),
        ],
      ),
    );

    if (widget.isTab) {
      return content;
    }

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: AppColors.darkBackground,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text('Risk Vault', style: AppTypography.h2(color: Colors.white)),
      ),
      body: SafeArea(child: content),
    );
  }
}
