import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/providers/market_provider.dart';
import '../core/services/market_service.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_typography.dart';

class LiveTickerTape extends StatefulWidget {
  const LiveTickerTape({super.key});

  @override
  State<LiveTickerTape> createState() => _LiveTickerTapeState();
}

class _LiveTickerTapeState extends State<LiveTickerTape> {
  late final ScrollController _scrollController;
  Timer? _scrollTimer;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    WidgetsBinding.instance.addPostFrameCallback((_) => _startScrolling());
  }

  void _startScrolling() {
    _scrollTimer = Timer.periodic(const Duration(milliseconds: 40), (_) {
      if (!_scrollController.hasClients) return;
      final maxScroll = _scrollController.position.maxScrollExtent;
      final currentScroll = _scrollController.offset;
      if (currentScroll >= maxScroll) {
        _scrollController.jumpTo(0);
      } else {
        _scrollController.animateTo(
          currentScroll + 1.2,
          duration: const Duration(milliseconds: 40),
          curve: Curves.linear,
        );
      }
    });
  }

  @override
  void dispose() {
    _scrollTimer?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  String _formatPrice(StockQuoteData item) {
    if (item.assetClass == 'FOREX') {
      return item.price.toStringAsFixed(4);
    }
    if (item.price >= 1000) {
      return '\$${item.price.toStringAsFixed(2)}';
    }
    if (item.price < 1) {
      return '\$${item.price.toStringAsFixed(4)}';
    }
    return '\$${item.price.toStringAsFixed(2)}';
  }

  @override
  Widget build(BuildContext context) {
    final items = context.watch<MarketProvider>().tickerItems;

    if (items.isEmpty) {
      return Container(
        height: 34,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          color: Color(0xFF09111E),
          border: Border(
            top: BorderSide(color: Color(0xFF1E293B)),
            bottom: BorderSide(color: Color(0xFF1E293B)),
          ),
        ),
        child: Text(
          'Loading live market tape…',
          style: AppTypography.caption(color: AppColors.muted),
        ),
      );
    }

    return Container(
      height: 34,
      decoration: const BoxDecoration(
        color: Color(0xFF09111E),
        border: Border(
          top: BorderSide(color: Color(0xFF1E293B)),
          bottom: BorderSide(color: Color(0xFF1E293B)),
        ),
      ),
      child: ListView.builder(
        controller: _scrollController,
        scrollDirection: Axis.horizontal,
        itemCount: items.length * 10,
        itemBuilder: (context, index) {
          final item = items[index % items.length];
          final isUp = item.changePct24h >= 0;
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  item.symbol,
                  style: AppTypography.monoNumber(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppColors.white,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  _formatPrice(item),
                  style: AppTypography.monoNumber(
                    fontSize: 11,
                    color: const Color(0xFFCBD5E1),
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  isUp ? Icons.arrow_drop_up : Icons.arrow_drop_down,
                  size: 14,
                  color: isUp ? AppColors.success : AppColors.danger,
                ),
                Text(
                  '${isUp ? '+' : ''}${item.changePct24h.toStringAsFixed(2)}%',
                  style: AppTypography.monoNumber(
                    fontSize: 10,
                    color: isUp ? AppColors.success : AppColors.danger,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(width: 12),
                Container(width: 1, height: 12, color: const Color(0xFF1E293B)),
              ],
            ),
          );
        },
      ),
    );
  }
}
