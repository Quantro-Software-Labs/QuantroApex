import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/notification_provider.dart';
import '../../core/services/notification_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class AdvisorySignalDetailScreen extends StatelessWidget {
  final AdvisorySignalData signal;

  const AdvisorySignalDetailScreen({
    super.key,
    required this.signal,
  });

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<NotificationProvider>();
    final isBuy = signal.side == 'BUY';

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
                        label: signal.side,
                        color: isBuy ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                      ),
                      const SizedBox(width: AppSpacing.space3),
                      Text(signal.symbol, style: AppTypography.h1(color: AppColors.white)),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF3B82F6).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.4)),
                    ),
                    child: Text(
                      '${(signal.confidence * 100).toStringAsFixed(0)}% Conviction',
                      style: AppTypography.caption(color: const Color(0xFF3B82F6)).copyWith(fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.space4),

              // Overview Metrics
              Row(
                children: [
                  Expanded(
                    child: MetricTile(
                      label: 'Order Size',
                      value: '${signal.quantity.toStringAsFixed(0)} shs',
                      valueColor: AppColors.white,
                    ),
                  ),
                  Expanded(
                    child: MetricTile(
                      label: 'Est. Price',
                      value: '\$${signal.estimatedPrice.toStringAsFixed(2)}',
                      valueColor: const Color(0xFF3B82F6),
                    ),
                  ),
                  Expanded(
                    child: MetricTile(
                      label: 'Est. Exposure',
                      value: '\$${(signal.quantity * signal.estimatedPrice).toStringAsFixed(2)}',
                      valueColor: AppColors.white,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.space4),

              // AI Hypothesis Box
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
                        Text('AI Strategy Hypothesis',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFF59E0B))),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      signal.reasoning,
                      style: AppTypography.body(color: AppColors.white).copyWith(fontSize: 13),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space5),

              Row(
                children: [
                  Expanded(
                    child: PrimaryButton(
                      label: 'Approve & Execute',
                      onPressed: () async {
                        final success = await provider.respondToSignal(
                          signalId: signal.id,
                          action: 'APPROVE',
                          symbol: signal.symbol,
                          side: signal.side,
                          quantity: signal.quantity,
                        );
                        if (context.mounted && success) {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Trade approved for ${signal.symbol}!'),
                              backgroundColor: const Color(0xFF10B981),
                            ),
                          );
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: AppSpacing.space2),
                  Expanded(
                    child: GhostButton(
                      label: 'Reject Signal',
                      onPressed: () async {
                        await provider.respondToSignal(
                          signalId: signal.id,
                          action: 'REJECT',
                        );
                        if (context.mounted) {
                          Navigator.pop(context);
                        }
                      },
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
