import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/analytics_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import '../../widgets/equity_chart.dart';

class AnalyticsScreen extends StatelessWidget {
  final bool isTab;

  const AnalyticsScreen({
    super.key,
    this.isTab = false,
  });

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AnalyticsProvider>();
    final metrics = provider.metrics;
    final timeframe = provider.selectedTimeframe;
    final trades = provider.tradeHistory;

    Widget content = RefreshIndicator(
      onRefresh: () => provider.loadAnalytics(),
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.space4, vertical: AppSpacing.space3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Bar
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Performance', style: AppTypography.h1(color: AppColors.white)),
                Row(
                  children: ['1W', '1M', '3M', 'ALL'].map((tf) {
                    final isSelected = timeframe == tf;
                    return Padding(
                      padding: const EdgeInsets.only(left: 4),
                      child: GestureDetector(
                        onTap: () => provider.setTimeframe(tf),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: isSelected ? const Color(0xFF2563EB) : const Color(0xFF0F172A),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFF1E293B),
                            ),
                          ),
                          child: Text(
                            tf,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                              color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.space4),

            // Equity Curve Chart Card
            ApexCard(
              padding: AppSpacing.space4,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Portfolio Equity Curve', style: AppTypography.h3(color: AppColors.white)),
                  const SizedBox(height: AppSpacing.space3),
                  EquityChart(points: provider.equityCurve),
                  const SizedBox(height: AppSpacing.space2),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('● QuantroApex Equity', style: AppTypography.caption(color: const Color(0xFF3B82F6))),
                      Text('● Benchmark S&P 500', style: AppTypography.caption(color: const Color(0xFF64748B))),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.space4),

            // Key Metrics
            Text('Key Risk & Return Metrics', style: AppTypography.h2(color: AppColors.white)),
            const SizedBox(height: AppSpacing.space3),

            if (metrics != null) ...[
              Row(
                children: [
                  Expanded(
                    child: ApexCard(
                      padding: AppSpacing.space3,
                      child: MetricTile(
                        label: 'Win Rate',
                        value: '${(metrics.winRate * 100).toStringAsFixed(0)}%',
                        valueColor: const Color(0xFF10B981),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.space3),
                  Expanded(
                    child: ApexCard(
                      padding: AppSpacing.space3,
                      child: MetricTile(
                        label: 'Profit Factor',
                        value: metrics.profitFactor.toStringAsFixed(2),
                        valueColor: AppColors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.space3),
              Row(
                children: [
                  Expanded(
                    child: ApexCard(
                      padding: AppSpacing.space3,
                      child: MetricTile(
                        label: 'Sharpe Ratio',
                        value: metrics.sharpeRatio.toStringAsFixed(2),
                        valueColor: AppColors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.space3),
                  Expanded(
                    child: ApexCard(
                      padding: AppSpacing.space3,
                      child: MetricTile(
                        label: 'Max Drawdown',
                        value: '${(metrics.maxDrawdown * 100).toStringAsFixed(1)}%',
                        valueColor: AppColors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: AppSpacing.space4),

            // Trade Log
            Text('Trade Log & Execution History', style: AppTypography.h2(color: AppColors.white)),
            const SizedBox(height: AppSpacing.space3),

            if (provider.isLoading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(AppSpacing.space4),
                  child: CircularProgressIndicator(color: Color(0xFF3B82F6)),
                ),
              )
            else if (trades.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.space3),
                child: Text('No completed trades logged yet.', style: AppTypography.secondary(color: const Color(0xFF64748B))),
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
                              color: isBuy ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                            ),
                            const SizedBox(width: AppSpacing.space3),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(t.symbol, style: AppTypography.h3(color: AppColors.white)),
                                Text(
                                  '${t.fillQuantity.toStringAsFixed(0)} shares @ \$${t.fillPrice.toStringAsFixed(2)}',
                                  style: AppTypography.caption(color: const Color(0xFF64748B)),
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
                                    ? (t.realizedPnl >= 0 ? const Color(0xFF10B981) : const Color(0xFFEF4444))
                                    : AppColors.white,
                              ),
                            ),
                            Text(
                              _formatTime(t.filledAt),
                              style: AppTypography.caption(color: const Color(0xFF64748B)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              }),
            const SizedBox(height: AppSpacing.space4),
          ],
        ),
      ),
    );

    if (isTab) {
      return content;
    }

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: AppColors.darkBackground,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text('Performance & Analytics', style: AppTypography.h2(color: Colors.white)),
      ),
      body: SafeArea(child: content),
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
