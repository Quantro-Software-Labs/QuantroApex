import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/execution_provider.dart';
import '../../core/providers/risk_vault_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

/// Advanced order ticket: types, risk sizing, OCO brackets, confirm → POST /execution/order.
class OrderPanelSheet extends StatefulWidget {
  final String symbol;
  final String companyName;
  final double currentPrice;
  final String assetClass;
  final String initialSide;
  final bool isSimulated;

  const OrderPanelSheet({
    super.key,
    required this.symbol,
    required this.companyName,
    required this.currentPrice,
    this.assetClass = 'STOCKS',
    this.initialSide = 'BUY',
    this.isSimulated = true,
  });

  static Future<bool?> show(
    BuildContext context, {
    required String symbol,
    required String companyName,
    required double currentPrice,
    String assetClass = 'STOCKS',
    String initialSide = 'BUY',
    bool isSimulated = true,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => OrderPanelSheet(
        symbol: symbol,
        companyName: companyName,
        currentPrice: currentPrice,
        assetClass: assetClass,
        initialSide: initialSide,
        isSimulated: isSimulated,
      ),
    );
  }

  @override
  State<OrderPanelSheet> createState() => _OrderPanelSheetState();
}

class _OrderPanelSheetState extends State<OrderPanelSheet> {
  static const _orderTypes = ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT', 'TRAILING_STOP'];

  late String _side;
  String _orderType = 'MARKET';
  bool _ocoEnabled = false;
  bool _isSubmitting = false;
  String? _successMessage;
  bool _isSimulated = true;

  late final TextEditingController _qtyController;
  late final TextEditingController _limitController;
  late final TextEditingController _stopController;
  late final TextEditingController _trailingController;
  late final TextEditingController _takeProfitController;
  late final TextEditingController _stopLossController;
  late final TextEditingController _riskPctController;

  @override
  void initState() {
    super.initState();
    _side = widget.initialSide;
    _isSimulated = widget.isSimulated;
    final defaultQty =
        widget.assetClass == 'FOREX' ? '1.0' : widget.assetClass == 'CRYPTO' ? '0.5' : '10';
    _qtyController = TextEditingController(text: defaultQty);
    final px = widget.currentPrice.toStringAsFixed(widget.currentPrice < 2 ? 4 : 2);
    _limitController = TextEditingController(text: px);
    _stopController = TextEditingController(
      text: (widget.currentPrice * 0.98).toStringAsFixed(widget.currentPrice < 2 ? 4 : 2),
    );
    _trailingController = TextEditingController(text: '1.0');
    _takeProfitController = TextEditingController(
      text: (widget.currentPrice * 1.02).toStringAsFixed(widget.currentPrice < 2 ? 4 : 2),
    );
    _stopLossController = TextEditingController(
      text: (widget.currentPrice * 0.99).toStringAsFixed(widget.currentPrice < 2 ? 4 : 2),
    );
    _riskPctController = TextEditingController(text: '1.0');
    for (final c in [
      _qtyController,
      _limitController,
      _stopController,
      _trailingController,
      _takeProfitController,
      _stopLossController,
      _riskPctController,
    ]) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _limitController.dispose();
    _stopController.dispose();
    _trailingController.dispose();
    _takeProfitController.dispose();
    _stopLossController.dispose();
    _riskPctController.dispose();
    super.dispose();
  }

  double get _quantity => double.tryParse(_qtyController.text) ?? 0;
  double get _limitPrice => double.tryParse(_limitController.text) ?? widget.currentPrice;
  double get _stopPrice => double.tryParse(_stopController.text) ?? widget.currentPrice;
  double get _trailingAmount => double.tryParse(_trailingController.text) ?? 0;
  double? get _takeProfit => double.tryParse(_takeProfitController.text);
  double? get _stopLoss => double.tryParse(_stopLossController.text);
  double get _riskPct => double.tryParse(_riskPctController.text) ?? 1.0;

  double get _effectivePrice {
    switch (_orderType) {
      case 'LIMIT':
      case 'STOP_LIMIT':
        return _limitPrice;
      case 'STOP':
        return _stopPrice;
      default:
        return widget.currentPrice;
    }
  }

  double get _notional =>
      widget.assetClass == 'FOREX' ? _quantity * 1000 : _quantity * _effectivePrice;

  double get _riskDollars {
    final sl = _stopLoss;
    if (sl == null || _quantity <= 0) return _notional * (_riskPct / 100);
    return (_effectivePrice - sl).abs() * _quantity;
  }

  double get _rewardDollars {
    final tp = _takeProfit;
    if (tp == null || _quantity <= 0) return 0;
    return (tp - _effectivePrice).abs() * _quantity;
  }

  double? get _rrRatio {
    if (_riskDollars <= 0) return null;
    return _rewardDollars / _riskDollars;
  }

  void _sizeFromRisk(double accountEquity) {
    final sl = _stopLoss;
    if (sl == null || widget.currentPrice <= 0) return;
    final riskBudget = accountEquity * (_riskPct / 100);
    final perShareRisk = (widget.currentPrice - sl).abs();
    if (perShareRisk <= 0) return;
    final qty = riskBudget / perShareRisk;
    setState(() {
      _qtyController.text = qty < 1
          ? qty.toStringAsFixed(4)
          : qty.toStringAsFixed(qty >= 10 ? 0 : 2);
    });
  }

  Future<void> _confirmAndSubmit() async {
    if (_quantity <= 0) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.darkSurface,
        title: Text('Confirm $_side', style: AppTypography.h3(color: AppColors.white)),
        content: Text(
          '$_orderType $_side $_quantity ${widget.symbol}\n'
          'Notional ~ \$${_notional.toStringAsFixed(2)}\n'
          'Owner: MANUAL · ${_isSimulated ? 'Simulated' : 'Live'}',
          style: AppTypography.secondary(color: const Color(0xFF94A3B8)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Confirm', style: TextStyle(color: AppColors.accentLight)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _isSubmitting = true);

    final success = await context.read<ExecutionProvider>().placeOrder(
          symbol: widget.symbol,
          side: _side,
          quantity: _quantity,
          orderType: _orderType,
          limitPrice: (_orderType == 'LIMIT' || _orderType == 'STOP_LIMIT') ? _limitPrice : null,
          stopPrice: (_orderType == 'STOP' || _orderType == 'STOP_LIMIT') ? _stopPrice : null,
          trailingAmount: _orderType == 'TRAILING_STOP' ? _trailingAmount : null,
          takeProfit: _ocoEnabled ? _takeProfit : null,
          stopLoss: _ocoEnabled ? _stopLoss : null,
          isOco: _ocoEnabled,
          owner: 'MANUAL',
          assetClass: widget.assetClass,
          aiReasoning: 'Manual Trading Desk order',
          isSimulated: _isSimulated,
        );

    if (!mounted) return;
    setState(() => _isSubmitting = false);

    if (success) {
      setState(() {
        _successMessage = '$_side $_quantity ${widget.symbol} submitted (MANUAL).';
      });
      Future.delayed(const Duration(milliseconds: 1200), () {
        if (mounted) Navigator.pop(context, true);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final riskVault = context.watch<RiskVaultProvider>();
    final execution = context.watch<ExecutionProvider>();
    final vault = riskVault.vault;
    final equity = 100000.0;
    double maxExposure = 5000;
    if (vault != null) maxExposure = equity * vault.perTradeExposure;

    final blocked = riskVault.isEmergencyStopped ||
        _quantity <= 0 ||
        _notional > maxExposure ||
        _isSubmitting ||
        execution.isExecuting;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.92,
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        decoration: const BoxDecoration(
          color: AppColors.darkBackground,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(top: BorderSide(color: AppColors.darkBorder)),
        ),
        child: Column(
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFF334155),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Order Panel', style: AppTypography.h2(color: AppColors.white)),
                      Text(
                        '${widget.symbol} · ${widget.companyName}',
                        style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                      ),
                    ],
                  ),
                ),
                Text(
                  widget.currentPrice < 2
                      ? widget.currentPrice.toStringAsFixed(4)
                      : '\$${widget.currentPrice.toStringAsFixed(2)}',
                  style: AppTypography.h3(color: AppColors.white),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_successMessage != null) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.success.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppColors.success),
                        ),
                        child: Text(
                          _successMessage!,
                          style: AppTypography.secondary(color: AppColors.success),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (execution.errorMessage != null) ...[
                      Text(
                        execution.errorMessage!,
                        style: AppTypography.caption(color: AppColors.danger),
                      ),
                      const SizedBox(height: 8),
                    ],

                    // BUY / SELL
                    Row(
                      children: [
                        Expanded(child: _SideChip(
                          label: 'BUY',
                          selected: _side == 'BUY',
                          color: AppColors.success,
                          onTap: () => setState(() => _side = 'BUY'),
                        )),
                        const SizedBox(width: 10),
                        Expanded(child: _SideChip(
                          label: 'SELL',
                          selected: _side == 'SELL',
                          color: AppColors.danger,
                          onTap: () => setState(() => _side = 'SELL'),
                        )),
                      ],
                    ),
                    const SizedBox(height: 14),

                    Text('Order type', style: AppTypography.caption(color: const Color(0xFF94A3B8))),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: _orderTypes.map((t) {
                        final selected = _orderType == t;
                        return FilterChip(
                          selected: selected,
                          label: Text(
                            t.replaceAll('_', ' '),
                            style: TextStyle(
                              fontSize: 11,
                              color: selected ? Colors.white : const Color(0xFF94A3B8),
                            ),
                          ),
                          selectedColor: AppColors.accentLight,
                          backgroundColor: AppColors.darkSurface,
                          onSelected: (_) => setState(() => _orderType = t),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 14),

                    InputField(
                      label: widget.assetClass == 'FOREX'
                          ? 'Lots'
                          : widget.assetClass == 'CRYPTO'
                              ? 'Units'
                              : 'Quantity',
                      controller: _qtyController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    ),
                    const SizedBox(height: 12),

                    if (_orderType == 'LIMIT' || _orderType == 'STOP_LIMIT') ...[
                      InputField(
                        label: 'Limit price',
                        controller: _limitController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (_orderType == 'STOP' || _orderType == 'STOP_LIMIT') ...[
                      InputField(
                        label: 'Stop price',
                        controller: _stopController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (_orderType == 'TRAILING_STOP') ...[
                      InputField(
                        label: 'Trailing amount',
                        controller: _trailingController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Risk sizing
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.darkSurface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.darkBorder),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Risk calculator', style: AppTypography.secondary(color: AppColors.white)),
                          const SizedBox(height: 10),
                          InputField(
                            label: 'Risk % of equity',
                            controller: _riskPctController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          ),
                          const SizedBox(height: 8),
                          InputField(
                            label: 'Stop loss (for sizing)',
                            controller: _stopLossController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          ),
                          const SizedBox(height: 10),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton.icon(
                              onPressed: () => _sizeFromRisk(equity),
                              icon: const Icon(Icons.calculate_outlined, size: 16, color: AppColors.accentLight),
                              label: Text(
                                'Size qty from risk',
                                style: AppTypography.caption(color: AppColors.accentLight),
                              ),
                            ),
                          ),
                          const Divider(color: AppColors.darkBorder, height: 20),
                          _MetricRow(label: 'Notional', value: '\$${_notional.toStringAsFixed(2)}'),
                          _MetricRow(label: 'Est. risk', value: '\$${_riskDollars.toStringAsFixed(2)}'),
                          _MetricRow(
                            label: 'R:R',
                            value: _rrRatio == null ? '—' : '1:${_rrRatio!.toStringAsFixed(2)}',
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // OCO
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('OCO bracket', style: AppTypography.secondary(color: AppColors.white)),
                      subtitle: Text(
                        'Attach take-profit + stop-loss',
                        style: AppTypography.caption(color: const Color(0xFF64748B)),
                      ),
                      value: _ocoEnabled,
                      activeColor: AppColors.accentLight,
                      onChanged: (v) => setState(() => _ocoEnabled = v),
                    ),
                    if (_ocoEnabled) ...[
                      InputField(
                        label: 'Take profit',
                        controller: _takeProfitController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                      const SizedBox(height: 12),
                      InputField(
                        label: 'Stop loss',
                        controller: _stopLossController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                      const SizedBox(height: 8),
                    ],

                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Simulated', style: AppTypography.secondary(color: AppColors.white)),
                      subtitle: Text(
                        'isSimulated (default on)',
                        style: AppTypography.caption(color: const Color(0xFF64748B)),
                      ),
                      value: _isSimulated,
                      activeColor: AppColors.accentLight,
                      onChanged: (v) => setState(() => _isSimulated = v),
                    ),
                    const SizedBox(height: AppSpacing.space3),
                  ],
                ),
              ),
            ),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: _side == 'BUY' ? AppColors.success : AppColors.danger,
                  disabledBackgroundColor: const Color(0xFF1E293B),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: blocked ? null : _confirmAndSubmit,
                child: _isSubmitting || execution.isExecuting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text(
                        'Confirm $_side · MANUAL',
                        style: AppTypography.h3(color: Colors.white),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SideChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  const _SideChip({
    required this.label,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.2) : AppColors.darkSurface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? color : AppColors.darkBorder),
        ),
        child: Center(
          child: Text(
            label,
            style: AppTypography.h3(color: selected ? color : const Color(0xFF94A3B8)),
          ),
        ),
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  final String label;
  final String value;

  const _MetricRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AppTypography.caption(color: const Color(0xFF94A3B8))),
          Text(value, style: AppTypography.secondary(color: AppColors.white)),
        ],
      ),
    );
  }
}
