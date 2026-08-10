import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/execution_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class ExecutionControlsScreen extends StatefulWidget {
  const ExecutionControlsScreen({super.key});

  @override
  State<ExecutionControlsScreen> createState() => _ExecutionControlsScreenState();
}

class _ExecutionControlsScreenState extends State<ExecutionControlsScreen> {
  final _symbolController = TextEditingController(text: 'AAPL');
  final _qtyController = TextEditingController(text: '10');
  String _side = 'BUY';

  @override
  void dispose() {
    _symbolController.dispose();
    _qtyController.dispose();
    super.dispose();
  }

  Future<void> _handleExecute() async {
    final qty = double.tryParse(_qtyController.text) ?? 0;
    if (_symbolController.text.isEmpty || qty <= 0) return;

    final provider = context.read<ExecutionProvider>();
    final success = await provider.placeOrder(
      symbol: _symbolController.text.trim().toUpperCase(),
      side: _side,
      quantity: qty,
      aiReasoning: 'Manual execution request via controls',
    );

    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Order executed successfully.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ExecutionProvider>();
    final positions = provider.positions;
    final orders = provider.orders;

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.primary),
        title: Text('Execution Engine', style: AppTypography.h2(color: AppColors.primary)),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => provider.fetchExecutionState(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.space4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const StatusBadge(label: 'Alpaca Sandbox Connected', color: AppColors.success),
                const SizedBox(height: AppSpacing.space3),

                Text('Open Positions', style: AppTypography.h2(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space3),

                if (positions.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.space3),
                    child: Text('No active positions open.', style: AppTypography.secondary(color: AppColors.muted)),
                  )
                else
                  ...positions.map((pos) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.space3),
                      child: ApexCard(
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(pos.symbol, style: AppTypography.h2(color: AppColors.primary)),
                                const SizedBox(height: AppSpacing.space1),
                                Text(
                                  'Avg Cost: \$${pos.averageCost.toStringAsFixed(2)}',
                                  style: AppTypography.caption(color: AppColors.muted),
                                ),
                              ],
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  '${pos.quantity.toStringAsFixed(2)} shares',
                                  style: AppTypography.h3(color: AppColors.accent),
                                ),
                                const SizedBox(height: AppSpacing.space1),
                                Text(
                                  'Value: \$${(pos.quantity * pos.averageCost).toStringAsFixed(2)}',
                                  style: AppTypography.caption(color: AppColors.muted),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                const SizedBox(height: AppSpacing.space5),

                // Order Entry Form
                Text('Place Test Order', style: AppTypography.h2(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space3),
                ApexCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: InputField(
                              label: 'Symbol',
                              controller: _symbolController,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.space3),
                          Expanded(
                            child: InputField(
                              label: 'Quantity',
                              controller: _qtyController,
                              keyboardType: TextInputType.number,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.space4),
                      Row(
                        children: [
                          Expanded(
                            child: ChoiceChip(
                              label: const Center(child: Text('BUY')),
                              selected: _side == 'BUY',
                              selectedColor: AppColors.success,
                              onSelected: (_) => setState(() => _side = 'BUY'),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.space3),
                          Expanded(
                            child: ChoiceChip(
                              label: const Center(child: Text('SELL')),
                              selected: _side == 'SELL',
                              selectedColor: AppColors.danger,
                              onSelected: (_) => setState(() => _side = 'SELL'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.space4),
                      if (provider.errorMessage != null) ...[
                        Text(
                          provider.errorMessage!,
                          style: AppTypography.secondary(color: AppColors.danger),
                        ),
                        const SizedBox(height: AppSpacing.space3),
                      ],
                      PrimaryButton(
                        label: 'Dispatch to Alpaca Engine',
                        isLoading: provider.isExecuting,
                        onPressed: _handleExecute,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space5),

                // Order History
                Text('Order History', style: AppTypography.h2(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space3),
                if (orders.isEmpty)
                  Text('No recent orders logged.', style: AppTypography.secondary(color: AppColors.muted))
                else
                  ...orders.map((ord) {
                    final isBuy = ord.side == 'BUY';

                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.space2),
                      child: ApexCard(
                        padding: AppSpacing.space3,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                StatusBadge(
                                  label: ord.side,
                                  color: isBuy ? AppColors.success : AppColors.danger,
                                ),
                                const SizedBox(width: AppSpacing.space3),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(ord.symbol, style: AppTypography.h3(color: AppColors.primary)),
                                    Text(
                                      '${ord.quantity.toStringAsFixed(0)} shares @ ${ord.orderType}',
                                      style: AppTypography.caption(color: AppColors.muted),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            StatusBadge(
                              label: ord.status,
                              color: ord.status == 'FILLED' ? AppColors.accent : AppColors.muted,
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
