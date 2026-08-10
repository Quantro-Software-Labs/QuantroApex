import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/analytics_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import '../../widgets/equity_chart.dart';

class AnalyticsScreen extends StatelessWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AnalyticsProvider>();
    final metrics = provider.metrics;
    final timeframe = provider.selectedTimeframe;
    final trades = provider.tradeHistory;

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.primary),
        title: Text('Performance & Analytics', style: AppTypography.h2(color: AppColors.primary)),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => provider.loadAnalytics(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.space4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Equity Curve', style: AppTypography.h2(color: AppColors.primary)),
                    Row(
                      children: ['1W', '1M', '3M', 'ALL'].map((tf) {
                        final isSelected = timeframe == tf;
                        return Padding(
                          padding: const EdgeInsets.only(left: AppSpacing.space1),
                          child: ChoiceChip(
                            label: Text(tf, style: AppTypography.caption(color: isSelected ? AppColors.white : AppColors.primary)),
                            selected: isSelected,
                            selectedColor: AppColors.accent,
                            backgroundColor: AppColors.surface,
                            onSelected: (_) => provider.setTimeframe(tf),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.space3),

                ApexCard(
                  child: Column(
                    children: [
                      EquityChart(points: provider.equityCurve),
                      const SizedBox(height: AppSpacing.space2),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Strategy Equity', style: AppTypography.caption(color: AppColors.accent)),
                          Text('Benchmark S&P 500', style: AppTypography.caption(color: AppColors.muted)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space5),

                Text('Key Risk & Return Metrics', style: AppTypography.h2(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space3),

                if (metrics != null) ...[
                  Row(
                    children: [
                      Expanded(
                        child: MetricTile(
                          label: 'Win Rate',
                          value: '${(metrics.winRate * 100).toStringAsFixed(0)}%',
                          valueColor: AppColors.success,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.space3),
                      Expanded(
                        child: MetricTile(
                          label: 'Profit Factor',
                          value: metrics.profitFactor.toStringAsFixed(2),
                          valueColor: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.space3),
                  Row(
                    children: [
                      Expanded(
                        child: MetricTile(
                          label: 'Sharpe Ratio',
                          value: metrics.sharpeRatio.toStringAsFixed(2),
                          valueColor: AppColors.primary,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.space3),
                      Expanded(
                        child: MetricTile(
                          label: 'Max Drawdown',
                          value: '${(metrics.maxDrawdown * 100).toStringAsFixed(1)}%',
                          valueColor: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: AppSpacing.space5),

                Text('Trade Log & Execution History', style: AppTypography.h2(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space3),

                if (provider.isLoading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(AppSpacing.space4),
                      child: CircularProgressIndicator(color: AppColors.accent),
                    ),
                  )
                else if (trades.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.space3),
                    child: Text('No completed trades logged yet.', style: AppTypography.secondary(color: AppColors.muted)),
                  )
                else
                  ...trades.map((t) {
                    final isBuy = t.side == 'BUY';
                    final hasPnl = t.realizedPnl != 0;

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
                                  label: t.side,
                                  color: isBuy ? AppColors.success : AppColors.danger,
                                ),
                                const SizedBox(width: AppSpacing.space3),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(t.symbol, style: AppTypography.h3(color: AppColors.primary)),
                                    Text(
                                      '${t.fillQuantity.toStringAsFixed(0)} shares @ \$${t.fillPrice.toStringAsFixed(2)}',
                                      style: AppTypography.caption(color: AppColors.muted),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  hasPnl
                                      ? '${t.realizedPnl >= 0 ? '+' : ''}\$${t.realizedPnl.toStringAsFixed(2)}'
                                      : 'FILLED',
                                  style: AppTypography.h3(
                                    color: hasPnl
                                        ? (t.realizedPnl >= 0 ? AppColors.success : AppColors.danger)
                                        : AppColors.primary,
                                  ),
                                ),
                                Text(
                                  _formatTime(t.filledAt),
                                  style: AppTypography.caption(color: AppColors.muted),
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

  String _formatTime(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${date.day}/${date.month}';
  }
}
