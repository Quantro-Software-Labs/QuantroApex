import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/market_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/tradingview_chart.dart';
import '../execution/trade_execution_modal.dart';

class StockDetailScreen extends StatefulWidget {
  final String symbol;

  const StockDetailScreen({super.key, required this.symbol});

  @override
  State<StockDetailScreen> createState() => _StockDetailScreenState();
}

class _StockDetailScreenState extends State<StockDetailScreen> {
  String _selectedTimeframe = '1M';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MarketProvider>().loadStockDetail(widget.symbol);
    });
  }

  @override
  Widget build(BuildContext context) {
    final marketProvider = context.watch<MarketProvider>();
    final detail = marketProvider.selectedStockDetail;
    final aiStudy = marketProvider.aiStudy;
    final isLoading = marketProvider.isDetailLoading;

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: const Color(0xFF060B14),
        elevation: 0,
        title: Text(widget.symbol, style: AppTypography.h2(color: AppColors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.accentLight),
            onPressed: () => marketProvider.loadStockDetail(widget.symbol),
          ),
        ],
      ),
      body: isLoading || detail == null
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.accentLight),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.space4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Stock Hero Header Card
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.space4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.glassBorder),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.25),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  detail.stock.name,
                                  style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                                ),
                                const SizedBox(height: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: AppColors.accent.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    '${detail.stock.assetClass} · ${detail.stock.sector}',
                                    style: AppTypography.caption(color: AppColors.accentLight),
                                  ),
                                ),
                              ],
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  detail.stock.price < 2
                                      ? detail.stock.price.toStringAsFixed(4)
                                      : '\$${detail.stock.price.toStringAsFixed(2)}',
                                  style: AppTypography.monoNumber(
                                    fontSize: 22,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.white,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: detail.stock.changePct24h >= 0
                                        ? AppColors.success.withValues(alpha: 0.2)
                                        : AppColors.danger.withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    '${detail.stock.changePct24h >= 0 ? '+' : ''}${detail.stock.changePct24h.toStringAsFixed(2)}%',
                                    style: AppTypography.monoNumber(
                                      fontSize: 12,
                                      color: detail.stock.changePct24h >= 0 ? AppColors.success : AppColors.danger,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.space4),

                  // Chart View Header & Timeframe Selector
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Live Technical Price Curve', style: AppTypography.h3(color: AppColors.white)),
                      Row(
                        children: ['1D', '1W', '1M', '3M', '1Y'].map((tf) {
                          final isSelected = _selectedTimeframe == tf;
                          return Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: GestureDetector(
                              onTap: () => setState(() => _selectedTimeframe = tf),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: isSelected ? AppColors.accent : const Color(0xFF0F172A),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  tf,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                                  ),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.space3),

                  // TradingView Lightweight Charts (candles + volume + SMC overlays)
                  TradingViewChart(
                    candles: detail.candles,
                    height: 260,
                    timeframe: _selectedTimeframe,
                  ),
                  const SizedBox(height: AppSpacing.space4),

                  // Live Order Book Depth Visualizer
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.space4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.glassBorder),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Order Book Depth & Pressure', style: AppTypography.h3(color: AppColors.white)),
                            Text('64% BUY / 36% SELL', style: AppTypography.caption(color: AppColors.success)),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.space2),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: Row(
                            children: [
                              Expanded(
                                flex: 64,
                                child: Container(height: 8, color: AppColors.success),
                              ),
                              const SizedBox(width: 2),
                              Expanded(
                                flex: 36,
                                child: Container(height: 8, color: AppColors.danger),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.space4),

                  // Technical Indicators Gauge Grid
                  Text('Technical Indicators', style: AppTypography.h3(color: AppColors.white)),
                  const SizedBox(height: AppSpacing.space3),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    childAspectRatio: 2.2,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    children: [
                      _buildMetricTile('RSI (14)', detail.technicals.rsi.toStringAsFixed(1), detail.technicals.rsi > 50 ? AppColors.success : AppColors.danger),
                      _buildMetricTile('MACD Histogram', detail.technicals.macd.toStringAsFixed(4), AppColors.accentLight),
                      _buildMetricTile('20-Day SMA', detail.stock.price < 2 ? detail.technicals.sma20.toStringAsFixed(4) : '\$${detail.technicals.sma20.toStringAsFixed(2)}', Colors.white),
                      _buildMetricTile('Support Level', detail.stock.price < 2 ? detail.technicals.supportLevel.toStringAsFixed(4) : '\$${detail.technicals.supportLevel.toStringAsFixed(2)}', AppColors.success),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.space4),

                  // Apex AI Stock Study Card
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.space4),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF0F172A), Color(0xFF1E1B4B)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.accent.withValues(alpha: 0.4)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.psychology, color: AppColors.accentLight),
                            const SizedBox(width: AppSpacing.space2),
                            Text('Apex AI Study Engine', style: AppTypography.h3(color: AppColors.white)),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.space3),
                        if (aiStudy != null) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.accent.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'Recommendation: ${aiStudy.recommendation}',
                              style: AppTypography.caption(color: AppColors.accentLight),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.space2),
                          Text(
                            aiStudy.studyText,
                            style: AppTypography.body(color: const Color(0xFFCBD5E1)),
                          ),
                        ] else ...[
                          Text(
                            'Generate an instant Gemini 2.5 Flash technical & fundamental breakdown for ${widget.symbol}.',
                            style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                          ),
                          const SizedBox(height: AppSpacing.space3),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.accent,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              onPressed: marketProvider.isAiStudyLoading
                                  ? null
                                  : () => marketProvider.generateAiStudy(widget.symbol),
                              icon: marketProvider.isAiStudyLoading
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : const Icon(Icons.auto_awesome, size: 16, color: Colors.white),
                              label: Text(
                                marketProvider.isAiStudyLoading ? 'Studying ${widget.symbol}...' : 'Study ${widget.symbol} with Apex AI',
                                style: const TextStyle(color: Colors.white),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.space6),
                ],
              ),
            ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(AppSpacing.space4),
        decoration: const BoxDecoration(
          color: Color(0xFF060B14),
          border: Border(top: BorderSide(color: Color(0xFF1E293B))),
        ),
        child: SizedBox(
          height: 50,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.accent,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: detail == null
                ? null
                : () {
                    TradeExecutionModal.show(
                      context,
                      symbol: detail.stock.symbol,
                      companyName: detail.stock.name,
                      currentPrice: detail.stock.price,
                      assetClass: detail.stock.assetClass,
                    );
                  },
            child: Text(
              'Initiate Trade (${widget.symbol})',
              style: AppTypography.h3(color: Colors.white),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMetricTile(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.glassBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: AppTypography.caption(color: const Color(0xFF94A3B8))),
          const SizedBox(height: 2),
          Text(
            value,
            style: AppTypography.monoNumber(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
