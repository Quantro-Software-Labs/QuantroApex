import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/providers/simulation_provider.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_typography.dart';
import 'components.dart';

class DemoCapitalDialog extends StatefulWidget {
  const DemoCapitalDialog({super.key});

  static Future<void> show(BuildContext context) {
    return showDialog(
      context: context,
      builder: (context) => const DemoCapitalDialog(),
    );
  }

  @override
  State<DemoCapitalDialog> createState() => _DemoCapitalDialogState();
}

class _DemoCapitalDialogState extends State<DemoCapitalDialog> {
  static const List<double> presets = [5000, 10000, 25000, 50000, 100000];
  double _selectedAmount = 100000;
  final TextEditingController _customController = TextEditingController();
  bool _isCustom = false;
  String? _errorText;

  @override
  void dispose() {
    _customController.dispose();
    super.dispose();
  }

  void _onApply() async {
    double finalAmount = _selectedAmount;
    if (_isCustom) {
      final parsed = double.tryParse(_customController.text.replaceAll(',', ''));
      if (parsed == null || parsed < 100 || parsed > 10000000) {
        setState(() {
          _errorText = 'Enter a valid amount between \$100 and \$10,000,000.';
        });
        return;
      }
      finalAmount = parsed;
    }

    final provider = context.read<SimulationProvider>();
    final nav = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);

    nav.pop(); // Close dialog

    final success = await provider.resetSimulation(startingCapital: finalAmount);
    if (success) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            'Demo account balance set to \$${finalAmount.toStringAsFixed(2)}',
          ),
          backgroundColor: const Color(0xFF10B981),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SimulationProvider>();

    return AlertDialog(
      backgroundColor: const Color(0xFF0F172A),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.account_balance_wallet_outlined, color: Color(0xFF3B82F6), size: 20),
          ),
          const SizedBox(width: AppSpacing.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Set Demo Capital', style: AppTypography.h2(color: AppColors.white)),
                Text('Configure paper trading starting balance', style: AppTypography.caption(color: const Color(0xFF94A3B8))),
              ],
            ),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Quick Select Presets', style: AppTypography.caption(color: const Color(0xFF94A3B8))),
            const SizedBox(height: AppSpacing.space2),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: presets.map((amount) {
                final isSelected = !_isCustom && _selectedAmount == amount;
                return ChoiceChip(
                  label: Text('\$${amount.toInt().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}'),
                  selected: isSelected,
                  selectedColor: const Color(0xFF2563EB),
                  backgroundColor: const Color(0xFF1E293B),
                  labelStyle: TextStyle(
                    color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                  ),
                  onSelected: (selected) {
                    if (selected) {
                      setState(() {
                        _selectedAmount = amount;
                        _isCustom = false;
                        _errorText = null;
                        _customController.clear();
                      });
                    }
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: AppSpacing.space4),
            Text('Or Enter Custom Demo Amount', style: AppTypography.caption(color: const Color(0xFF94A3B8))),
            const SizedBox(height: AppSpacing.space2),
            TextField(
              controller: _customController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: AppTypography.body(color: AppColors.white),
              decoration: InputDecoration(
                prefixText: '\$ ',
                prefixStyle: const TextStyle(color: Color(0xFF3B82F6), fontWeight: FontWeight.bold),
                hintText: 'e.g. 15000',
                hintStyle: const TextStyle(color: Color(0xFF64748B)),
                filled: true,
                fillColor: const Color(0xFF1E293B),
                errorText: _errorText,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF3B82F6)),
                ),
              ),
              onChanged: (val) {
                if (val.isNotEmpty) {
                  setState(() {
                    _isCustom = true;
                    _errorText = null;
                  });
                }
              },
            ),
            const SizedBox(height: AppSpacing.space3),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B).withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.2)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, size: 16, color: Color(0xFF3B82F6)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Setting a custom demo capital resets paper orders and initializes your sandbox portfolio with this amount.',
                      style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      actions: [
        GhostButton(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
        PrimaryButton(
          label: 'Apply Demo Capital',
          isLoading: provider.isResetting,
          onPressed: _onApply,
        ),
      ],
    );
  }
}
