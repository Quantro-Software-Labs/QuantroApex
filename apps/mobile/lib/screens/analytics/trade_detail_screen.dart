import 'package:flutter/material.dart';
import '../../core/services/execution_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class TradeDetailScreen extends StatelessWidget {
  final OrderData order;

  const TradeDetailScreen({
    super.key,
    required this.order,
  });

  @override
  Widget build(BuildContext context) {
    final isBuy = order.side == 'BUY';

    return Container(
      padding: const EdgeInsets.all(AppSpacing.space4),
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: Color(0xFF1E293B))),
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.space3),

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      StatusBadge(
                        label: order.side,
                        color: isBuy ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                      ),
                      const SizedBox(width: AppSpacing.space3),
                      Text(order.symbol, style: AppTypography.h1(color: AppColors.white)),
                    ],
                  ),
                  StatusBadge(
                    label: order.status,
                    color: order.status == 'FILLED' ? const Color(0xFF3B82F6) : const Color(0xFF64748B),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.space4),

              // Metrics Grid
              Row(
                children: [
                  Expanded(
                    child: MetricTile(
                      label: 'Order Type',
                      value: order.orderType,
                      valueColor: AppColors.white,
                    ),
                  ),
                  Expanded(
                    child: MetricTile(
                      label: 'Quantity',
                      value: '${order.quantity.toStringAsFixed(0)} shs',
                      valueColor: AppColors.white,
                    ),
                  ),
                  Expanded(
                    child: MetricTile(
                      label: 'Price',
                      value: order.limitPrice != null ? '\$${order.limitPrice!.toStringAsFixed(2)}' : 'Market',
                      valueColor: const Color(0xFF3B82F6),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.space4),

              ApexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Order Details', style: AppTypography.h3(color: AppColors.white)),
                    const SizedBox(height: AppSpacing.space2),
                    _buildRow('Order ID', order.id),
                    const SizedBox(height: 6),
                    _buildRow('Submitted At', '${order.createdAt.toLocal()}'.split('.').first),
                    const SizedBox(height: 6),
                    _buildRow('Execution Mode', order.isSimulated ? 'Simulated Sandbox' : 'Live Broker'),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space4),

              // Gemini AI Hypothesis Box
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.space3),
                decoration: BoxDecoration(
                  color: const Color(0xFF060B14),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF1E293B)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: const [
                        Icon(Icons.auto_awesome_rounded, color: Color(0xFFF59E0B), size: 16),
                        SizedBox(width: 6),
                        Text(
                          'Apex Gemini AI Reasoning',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFFF59E0B),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Apex reasoning: ${isBuy ? '20-period SMA breakout + bullish momentum signal.' : 'Target profit exit level reached.'} Sized within Risk Vault limits.',
                      style: AppTypography.body(color: AppColors.white).copyWith(fontSize: 13, fontStyle: FontStyle.italic),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space5),

              PrimaryButton(
                label: 'Close Detail',
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: AppTypography.caption(color: const Color(0xFF64748B))),
        Text(value, style: AppTypography.body(color: Colors.white).copyWith(fontSize: 12, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
