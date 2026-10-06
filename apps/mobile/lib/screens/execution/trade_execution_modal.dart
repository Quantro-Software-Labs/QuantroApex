import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/execution_provider.dart';
import '../../core/providers/risk_vault_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class TradeExecutionModal extends StatefulWidget {
  final String symbol;
  final String companyName;
  final double currentPrice;
  final String assetClass;

  const TradeExecutionModal({
    super.key,
    required this.symbol,
    required this.companyName,
    required this.currentPrice,
    this.assetClass = 'STOCKS',
  });

  static void show(
    BuildContext context, {
    required String symbol,
    required String companyName,
    required double currentPrice,
    String assetClass = 'STOCKS',
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => TradeExecutionModal(
        symbol: symbol,
        companyName: companyName,
        currentPrice: currentPrice,
        assetClass: assetClass,
      ),
    );
  }

  @override
  State<TradeExecutionModal> createState() => _TradeExecutionModalState();
}

class _TradeExecutionModalState extends State<TradeExecutionModal> {
  String _side = 'BUY';
  String _orderType = 'MARKET';
  late final TextEditingController _qtyController;
  late final TextEditingController _limitPriceController;
  bool _isSubmitting = false;
  String? _successMessage;

  @override
  void initState() {
    super.initState();
    final defaultQty = widget.assetClass == 'FOREX' ? '1.0' : widget.assetClass == 'CRYPTO' ? '0.5' : '10';
    _qtyController = TextEditingController(text: defaultQty);
    _limitPriceController = TextEditingController(text: widget.currentPrice.toStringAsFixed(widget.currentPrice < 2 ? 4 : 2));
    _qtyController.addListener(_onFormChanged);
    _limitPriceController.addListener(_onFormChanged);
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _limitPriceController.dispose();
    super.dispose();
  }

  void _onFormChanged() {
    setState(() {});
  }

  double get _quantity => double.tryParse(_qtyController.text) ?? 0;
  double get _effectivePrice => _orderType == 'LIMIT'
      ? (double.tryParse(_limitPriceController.text) ?? widget.currentPrice)
      : widget.currentPrice;
  double get _estimatedTotal => widget.assetClass == 'FOREX' ? _quantity * 1000 : _quantity * _effectivePrice;

  Future<void> _submitOrder() async {
    if (_quantity <= 0) return;

    setState(() {
      _isSubmitting = true;
    });

    final executionProvider = context.read<ExecutionProvider>();
    final success = await executionProvider.placeOrder(
      symbol: widget.symbol,
      side: _side,
      quantity: _quantity,
      limitPrice: _orderType == 'LIMIT' ? _effectivePrice : null,
      assetClass: widget.assetClass,
    );

    setState(() {
      _isSubmitting = false;
    });

    if (success) {
      setState(() {
        _successMessage = '$_side order for $_quantity ${widget.symbol} submitted & logged for V2 AI training!';
      });
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) Navigator.pop(context);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final riskVaultProvider = context.watch<RiskVaultProvider>();
    final vault = riskVaultProvider.vault;

    double maxExposureLimit = 5000;
    if (vault != null) {
      maxExposureLimit = 100000 * vault.perTradeExposure;
    }
    final isExposureExceeded = _estimatedTotal > maxExposureLimit;
    final isEmergencyStopped = riskVaultProvider.isEmergencyStopped;

    bool isAssetDisabled = false;
    if (vault != null) {
      if (widget.assetClass == 'FOREX' && !vault.forexEnabled) isAssetDisabled = true;
      if (widget.assetClass == 'CRYPTO' && !vault.cryptoEnabled) isAssetDisabled = true;
      if (widget.assetClass == 'STOCKS' && !vault.stocksEnabled) isAssetDisabled = true;
    }

    final quickQuantities = widget.assetClass == 'FOREX' || widget.assetClass == 'CRYPTO'
        ? [0.1, 0.5, 1.0, 2.5, 5.0, 10.0]
        : [1.0, 5.0, 10.0, 25.0, 50.0, 100.0];

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.space5),
        decoration: const BoxDecoration(
          color: Color(0xFF0B132B),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(top: BorderSide(color: Color(0xFF1E293B))),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.space4),

              // Symbol Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(widget.symbol, style: AppTypography.h1(color: AppColors.white)),
                          const SizedBox(width: AppSpacing.space2),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: widget.assetClass == 'CRYPTO'
                                  ? Colors.amber.withValues(alpha: 0.2)
                                  : widget.assetClass == 'FOREX'
                                      ? Colors.purple.withValues(alpha: 0.2)
                                      : const Color(0xFF1E293B),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              widget.assetClass,
                              style: AppTypography.caption(
                                color: widget.assetClass == 'CRYPTO'
                                    ? Colors.amber
                                    : widget.assetClass == 'FOREX'
                                        ? Colors.purpleAccent
                                        : AppColors.accentLight,
                              ),
                            ),
                          ),
                        ],
                      ),
                      Text(widget.companyName, style: AppTypography.caption(color: const Color(0xFF94A3B8))),
                    ],
                  ),
                  Text(
                    widget.currentPrice < 2
                        ? widget.currentPrice.toStringAsFixed(4)
                        : '\$${widget.currentPrice.toStringAsFixed(2)}',
                    style: AppTypography.h2(color: AppColors.white),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.space5),

              if (_successMessage != null) ...[
                Container(
                  padding: const EdgeInsets.all(AppSpacing.space4),
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.success),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle, color: AppColors.success),
                      const SizedBox(width: AppSpacing.space3),
                      Expanded(
                        child: Text(
                          _successMessage!,
                          style: AppTypography.body(color: AppColors.success),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space4),
              ],

              // Side Toggle (BUY / SELL)
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _side = 'BUY'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: _side == 'BUY' ? AppColors.success.withValues(alpha: 0.2) : const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _side == 'BUY' ? AppColors.success : const Color(0xFF1E293B),
                          ),
                        ),
                        child: Center(
                          child: Text(
                            'BUY',
                            style: AppTypography.h3(
                              color: _side == 'BUY' ? AppColors.success : const Color(0xFF94A3B8),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.space3),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _side = 'SELL'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: _side == 'SELL' ? AppColors.danger.withValues(alpha: 0.2) : const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _side == 'SELL' ? AppColors.danger : const Color(0xFF1E293B),
                          ),
                        ),
                        child: Center(
                          child: Text(
                            'SELL',
                            style: AppTypography.h3(
                              color: _side == 'SELL' ? AppColors.danger : const Color(0xFF94A3B8),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.space4),

              // Order Type Selector
              Row(
                children: ['MARKET', 'LIMIT'].map((type) {
                  final isSelected = _orderType == type;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      selected: isSelected,
                      label: Text(type, style: AppTypography.caption(color: isSelected ? Colors.white : Colors.grey)),
                      selectedColor: AppColors.accent,
                      backgroundColor: const Color(0xFF0F172A),
                      onSelected: (_) => setState(() => _orderType = type),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: AppSpacing.space4),

              // Quantity Input & Quick Selector
              InputField(
                label: widget.assetClass == 'FOREX'
                    ? 'Lots Size (e.g. 0.10, 1.00)'
                    : widget.assetClass == 'CRYPTO'
                        ? 'Token Units'
                        : 'Quantity (Shares)',
                controller: _qtyController,
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: AppSpacing.space2),
              Row(
                children: quickQuantities.map((qtyVal) {
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        side: const BorderSide(color: Color(0xFF1E293B)),
                      ),
                      onPressed: () => setState(() => _qtyController.text = qtyVal.toString()),
                      child: Text('+$qtyVal', style: const TextStyle(fontSize: 11, color: Colors.white)),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: AppSpacing.space4),

              if (_orderType == 'LIMIT') ...[
                InputField(
                  label: 'Limit Price',
                  controller: _limitPriceController,
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: AppSpacing.space4),
              ],

              // Estimated Total & Risk Vault Pre-Check
              Container(
                padding: const EdgeInsets.all(AppSpacing.space4),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFF1E293B)),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Estimated Order Value:', style: AppTypography.caption(color: const Color(0xFF94A3B8))),
                        Text('\$${_estimatedTotal.toStringAsFixed(2)}', style: AppTypography.h3(color: AppColors.white)),
                      ],
                    ),
                    const Divider(color: Color(0xFF1E293B), height: 20),
                    Row(
                      children: [
                        Icon(
                          isEmergencyStopped || isExposureExceeded || isAssetDisabled ? Icons.warning_amber_rounded : Icons.shield_outlined,
                          size: 18,
                          color: isEmergencyStopped || isExposureExceeded || isAssetDisabled
                              ? AppColors.warning
                              : AppColors.success,
                        ),
                        const SizedBox(width: AppSpacing.space2),
                        Expanded(
                          child: Text(
                            isAssetDisabled
                                ? 'Risk Vault: ${widget.assetClass} trading is turned off in settings.'
                                : isEmergencyStopped
                                    ? 'Risk Vault: trading is paused by emergency stop.'
                                    : isExposureExceeded
                                        ? 'Risk Vault: this size is above your per-trade limit (\$${maxExposureLimit.toStringAsFixed(2)}).'
                                        : 'Risk Vault: order is within your exposure and loss limits.',
                            style: AppTypography.caption(
                              color: isEmergencyStopped || isExposureExceeded || isAssetDisabled
                                  ? AppColors.warning
                                  : AppColors.success,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space5),

              // Submit Button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _side == 'BUY' ? AppColors.accent : AppColors.danger,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: (_isSubmitting || isEmergencyStopped || isExposureExceeded || isAssetDisabled || _quantity <= 0)
                      ? null
                      : _submitOrder,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(
                          'Execute $_side Order (${widget.assetClass})',
                          style: AppTypography.h3(color: Colors.white),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
