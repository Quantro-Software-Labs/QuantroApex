import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/notification_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class AdvisoryFeedScreen extends StatelessWidget {
  const AdvisoryFeedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<NotificationProvider>();
    final signals = provider.advisorySignals;

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.primary),
        title: Text('Advisory Mode Signals', style: AppTypography.h2(color: AppColors.primary)),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => provider.loadNotificationState(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.space4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Pending Trade Recommendations', style: AppTypography.h2(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space1),
                Text(
                  'In Advisory Mode, Apex highlights high-conviction signals requiring your manual approval before execution.',
                  style: AppTypography.secondary(color: AppColors.muted),
                ),
                const SizedBox(height: AppSpacing.space4),

                if (provider.isLoading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(AppSpacing.space4),
                      child: CircularProgressIndicator(color: AppColors.accent),
                    ),
                  )
                else if (signals.isEmpty)
                  ApexCard(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: AppSpacing.space4),
                      child: Column(
                        children: [
                          const Icon(Icons.check_circle_outline, color: AppColors.success, size: 48),
                          const SizedBox(height: AppSpacing.space2),
                          Text('All Signals Reviewed', style: AppTypography.h3(color: AppColors.primary)),
                          const SizedBox(height: AppSpacing.space1),
                          Text(
                            'No pending advisory recommendations right now.',
                            style: AppTypography.caption(color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                  )
                else
                  ...signals.map((signal) {
                    final isBuy = signal.side == 'BUY';

                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.space4),
                      child: ApexCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    StatusBadge(
                                      label: signal.side,
                                      color: isBuy ? AppColors.success : AppColors.danger,
                                    ),
                                    const SizedBox(width: AppSpacing.space3),
                                    Text(signal.symbol, style: AppTypography.h2(color: AppColors.primary)),
                                  ],
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: AppColors.accent.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    '${(signal.confidence * 100).toStringAsFixed(0)}% Confidence',
                                    style: AppTypography.caption(color: AppColors.accent)
                                        .copyWith(fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppSpacing.space3),

                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Quantity: ${signal.quantity.toStringAsFixed(0)} shares',
                                  style: AppTypography.body(color: AppColors.primary),
                                ),
                                Text(
                                  'Est. Price: \$${signal.estimatedPrice.toStringAsFixed(2)}',
                                  style: AppTypography.body(color: AppColors.primary),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppSpacing.space3),

                            Container(
                              padding: const EdgeInsets.all(AppSpacing.space3),
                              decoration: BoxDecoration(
                                color: AppColors.surface,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('AI Strategy Hypothesis', style: AppTypography.caption(color: AppColors.muted)),
                                  const SizedBox(height: 4),
                                  Text(signal.reasoning, style: AppTypography.body(color: AppColors.primary)),
                                ],
                              ),
                            ),
                            const SizedBox(height: AppSpacing.space4),

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
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          SnackBar(
                                            content: Text('Trade approved and order executed for ${signal.symbol}!'),
                                            backgroundColor: AppColors.success,
                                          ),
                                        );
                                      }
                                    },
                                  ),
                                ),
                                const SizedBox(width: AppSpacing.space2),
                                Expanded(
                                  child: GhostButton(
                                    label: 'Reject',
                                    onPressed: () => provider.respondToSignal(
                                      signalId: signal.id,
                                      action: 'REJECT',
                                    ),
                                  ),
                                ),
                              ],
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
