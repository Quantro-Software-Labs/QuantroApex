import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/market_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/price_tick_flash.dart';
import '../../widgets/sentiment_gauge_widget.dart';
import '../execution/trade_execution_modal.dart';
import 'stock_detail_screen.dart';

class MarketScreen extends StatefulWidget {
  const MarketScreen({super.key});

  @override
  State<MarketScreen> createState() => _MarketScreenState();
}

class _MarketScreenState extends State<MarketScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MarketProvider>().loadMarketHub();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final marketProvider = context.watch<MarketProvider>();
    final stocks = marketProvider.stocks;
    final isLoading = marketProvider.isLoading;
    final selectedAssetClass = marketProvider.selectedAssetClass;
    final sentiment = marketProvider.sentiment;

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: const Color(0xFF060B14),
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Multi-Asset Market Hub', style: AppTypography.h2(color: AppColors.white)),
            Text('Browse Stocks, Forex & Crypto Coins to study & trade', style: AppTypography.caption(color: const Color(0xFF94A3B8))),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.accentLight),
            onPressed: () => marketProvider.loadMarketHub(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Top Segmented Asset Class Switcher (STOCKS, FOREX, CRYPTO)
          Container(
            margin: const EdgeInsets.fromLTRB(AppSpacing.space4, AppSpacing.space2, AppSpacing.space4, 0),
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.glassBorder),
            ),
            child: Row(
              children: [
                _buildSegmentTab(context, 'ALL', 'All Markets', Icons.public, selectedAssetClass),
                _buildSegmentTab(context, 'STOCKS', 'Stocks', Icons.show_chart_rounded, selectedAssetClass),
                _buildSegmentTab(context, 'FOREX', 'Forex', Icons.currency_exchange_rounded, selectedAssetClass),
                _buildSegmentTab(context, 'CRYPTO', 'Crypto Coins', Icons.currency_bitcoin_rounded, selectedAssetClass),
              ],
            ),
          ),

          // Main Scrollable Body with Sentiment Gauge & Search
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.space4),
              child: Column(
                children: [
                  // Market Sentiment Fear & Greed Dial
                  if (sentiment != null)
                    SentimentGaugeWidget(
                      score: sentiment.score,
                      label: sentiment.label,
                      summary: sentiment.summary,
                    )
                  else
                    const SentimentGaugeWidget(
                      score: 50,
                      label: 'Loading…',
                      summary: 'Computing cross-asset sentiment from live quotes.',
                    ),
                  const SizedBox(height: AppSpacing.space4),

                  // Search Bar
                  TextField(
                    controller: _searchController,
                    style: const TextStyle(color: Colors.white),
                    onChanged: (val) => marketProvider.setSearchQuery(val),
                    decoration: InputDecoration(
                      hintText: 'Search tickers (e.g. AAPL, EUR/USD, BTC/USDT)...',
                      hintStyle: const TextStyle(color: Color(0xFF64748B)),
                      prefixIcon: const Icon(Icons.search, color: Color(0xFF94A3B8)),
                      filled: true,
                      fillColor: const Color(0xFF0F172A),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: AppColors.glassBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: AppColors.glassBorder),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: AppColors.accent),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.space3),

                  // Sector Filter Pills
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: marketProvider.availableSectors.map((sector) {
                        final isSelected = marketProvider.selectedSector == sector;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: FilterChip(
                            selected: isSelected,
                            label: Text(sector, style: AppTypography.caption(color: isSelected ? Colors.white : Colors.grey)),
                            selectedColor: AppColors.accent,
                            backgroundColor: const Color(0xFF0F172A),
                            onSelected: (_) => marketProvider.setSelectedSector(sector),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.space4),

                  // Asset Cards List
                  isLoading
                      ? const Center(child: CircularProgressIndicator(color: AppColors.accentLight))
                      : stocks.isEmpty
                          ? Center(
                              child: Text('No assets match your search.', style: AppTypography.body(color: const Color(0xFF94A3B8))),
                            )
                          : ListView.builder(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              itemCount: stocks.length,
                              itemBuilder: (context, index) {
                                final asset = stocks[index];
                                final isForex = asset.assetClass == 'FOREX';
                                final isCrypto = asset.assetClass == 'CRYPTO';
                                final priceText = isForex
                                    ? asset.price.toStringAsFixed(4)
                                    : '\$${asset.price >= 10 ? asset.price.toStringAsFixed(2) : asset.price.toStringAsFixed(4)}';

                                return Container(
                                  margin: const EdgeInsets.only(bottom: AppSpacing.space3),
                                  padding: const EdgeInsets.all(AppSpacing.space4),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF0F172A),
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(color: AppColors.glassBorder),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.2),
                                        blurRadius: 8,
                                        offset: const Offset(0, 4),
                                      ),
                                    ],
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: GestureDetector(
                                          onTap: () {
                                            Navigator.push(
                                              context,
                                              MaterialPageRoute(
                                                builder: (_) => StockDetailScreen(symbol: asset.symbol),
                                              ),
                                            );
                                          },
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Row(
                                                children: [
                                                  Text(asset.symbol, style: AppTypography.h3(color: AppColors.white)),
                                                  const SizedBox(width: 8),
                                                  Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                    decoration: BoxDecoration(
                                                      color: isCrypto
                                                          ? Colors.amber.withValues(alpha: 0.15)
                                                          : isForex
                                                              ? Colors.purple.withValues(alpha: 0.15)
                                                              : const Color(0xFF1E293B),
                                                      borderRadius: BorderRadius.circular(4),
                                                    ),
                                                    child: Text(
                                                      asset.assetClass,
                                                      style: TextStyle(
                                                        fontSize: 10,
                                                        color: isCrypto
                                                            ? Colors.amber
                                                            : isForex
                                                                ? Colors.purpleAccent
                                                                : const Color(0xFF94A3B8),
                                                        fontWeight: FontWeight.bold,
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 2),
                                              Text(asset.name, style: AppTypography.caption(color: const Color(0xFF64748B))),
                                            ],
                                          ),
                                        ),
                                      ),

                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          PriceTickFlash(
                                            priceText: priceText,
                                            changePct: asset.changePct24h,
                                            textStyle: AppTypography.monoNumber(
                                              fontSize: 15,
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.white,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: asset.changePct24h >= 0
                                                  ? AppColors.success.withValues(alpha: 0.15)
                                                  : AppColors.danger.withValues(alpha: 0.15),
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                            child: Text(
                                              '${asset.changePct24h >= 0 ? '+' : ''}${asset.changePct24h.toStringAsFixed(2)}%',
                                              style: TextStyle(
                                                fontSize: 11,
                                                color: asset.changePct24h >= 0 ? AppColors.success : AppColors.danger,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),

                                      const SizedBox(width: AppSpacing.space3),

                                      // Action Buttons
                                      Column(
                                        children: [
                                          OutlinedButton(
                                            style: OutlinedButton.styleFrom(
                                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                              side: const BorderSide(color: AppColors.accentLight),
                                            ),
                                            onPressed: () {
                                              Navigator.push(
                                                context,
                                                MaterialPageRoute(
                                                  builder: (_) => StockDetailScreen(symbol: asset.symbol),
                                                ),
                                              );
                                            },
                                            child: const Text('Study', style: TextStyle(fontSize: 11, color: AppColors.accentLight)),
                                          ),
                                          const SizedBox(height: 4),
                                          ElevatedButton(
                                            style: ElevatedButton.styleFrom(
                                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                              backgroundColor: AppColors.accent,
                                            ),
                                            onPressed: () {
                                              TradeExecutionModal.show(
                                                context,
                                                symbol: asset.symbol,
                                                companyName: asset.name,
                                                currentPrice: asset.price,
                                                assetClass: asset.assetClass,
                                              );
                                            },
                                            child: const Text('Trade', style: TextStyle(fontSize: 11, color: Colors.white)),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSegmentTab(
    BuildContext context,
    String key,
    String label,
    IconData icon,
    String activeKey,
  ) {
    final isSelected = activeKey == key;
    return Expanded(
      child: GestureDetector(
        onTap: () => context.read<MarketProvider>().setSelectedAssetClass(key),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.accent : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: isSelected ? Colors.white : const Color(0xFF94A3B8)),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
