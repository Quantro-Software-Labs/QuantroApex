import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../core/services/market_service.dart';
import '../core/theme/app_colors.dart';

/// SMC / ICT overlay payload drawn as price-line plugins on Lightweight Charts.
class SmcOverlays {
  final List<SmcLevel> orderBlocks;
  final List<SmcGap> fairValueGaps;
  final List<SmcLevel> liquidityLevels;
  final List<SmcStructureEvent> structureEvents;

  const SmcOverlays({
    this.orderBlocks = const [],
    this.fairValueGaps = const [],
    this.liquidityLevels = const [],
    this.structureEvents = const [],
  });

  Map<String, dynamic> toJson() => {
        'orderBlocks': orderBlocks.map((e) => e.toJson()).toList(),
        'fairValueGaps': fairValueGaps.map((e) => e.toJson()).toList(),
        'liquidityLevels': liquidityLevels.map((e) => e.toJson()).toList(),
        'structureEvents': structureEvents.map((e) => e.toJson()).toList(),
      };
}

class SmcLevel {
  final double price;
  final String side;
  final String? label;

  const SmcLevel({required this.price, this.side = 'bullish', this.label});

  Map<String, dynamic> toJson() => {
        'price': price,
        'side': side,
        if (label != null) 'label': label,
      };
}

class SmcGap {
  final double top;
  final double bottom;
  final String? label;

  const SmcGap({required this.top, required this.bottom, this.label});

  Map<String, dynamic> toJson() => {
        'top': top,
        'bottom': bottom,
        if (label != null) 'label': label,
      };
}

class SmcStructureEvent {
  final double price;
  final String type; // BOS | CHoCH
  final String? label;

  const SmcStructureEvent({
    required this.price,
    required this.type,
    this.label,
  });

  Map<String, dynamic> toJson() => {
        'price': price,
        'type': type,
        if (label != null) 'label': label,
      };
}

class IndicatorSeries {
  final String name;
  final Color color;
  final List<Map<String, dynamic>> points;

  const IndicatorSeries({
    required this.name,
    required this.points,
    this.color = AppColors.accent,
  });
}

/// TradingView Lightweight Charts via WebView — candlesticks, volume, indicators, SMC overlays.
class TradingViewChart extends StatefulWidget {
  final List<CandleData> candles;
  final double height;
  final String timeframe;
  final SmcOverlays? smc;
  final List<IndicatorSeries> indicators;

  const TradingViewChart({
    super.key,
    required this.candles,
    this.height = 280,
    this.timeframe = '1H',
    this.smc,
    this.indicators = const [],
  });

  @override
  State<TradingViewChart> createState() => _TradingViewChartState();
}

class _TradingViewChartState extends State<TradingViewChart> {
  late final WebViewController _controller;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0B132B))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            _ready = true;
            _pushData();
          },
        ),
      );

    if (kIsWeb) {
      // On Flutter web, load from asset URL / inline via loadHtmlString after fetch is harder;
      // use CDN shell identical to asset.
      _controller.loadFlutterAsset('assets/charts/tradingview_chart.html');
    } else {
      _controller.loadFlutterAsset('assets/charts/tradingview_chart.html');
    }
  }

  @override
  void didUpdateWidget(covariant TradingViewChart oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_ready) _pushData();
  }

  Future<void> _pushData() async {
    final candlesJson = jsonEncode(widget.candles.map(_candleToJson).toList());
    await _controller.runJavaScript(
      'window.QuantroChart && window.QuantroChart.setCandles($candlesJson);',
    );

    if (widget.smc != null) {
      final smcJson = jsonEncode(widget.smc!.toJson());
      await _controller.runJavaScript(
        'window.QuantroChart && window.QuantroChart.setSmcOverlays($smcJson);',
      );
    }

    for (final ind in widget.indicators) {
      final points = jsonEncode(ind.points);
      final color =
          '#${ind.color.value.toRadixString(16).padLeft(8, '0').substring(2)}';
      await _controller.runJavaScript(
        "window.QuantroChart && window.QuantroChart.addIndicator(${jsonEncode(ind.name)}, $points, ${jsonEncode(color)});",
      );
    }
  }

  int _toUnix(String raw) {
    final asInt = int.tryParse(raw);
    if (asInt != null) {
      // Heuristic: ms vs seconds
      return asInt > 1e12 ? asInt ~/ 1000 : asInt;
    }
    final parsed = DateTime.tryParse(raw);
    if (parsed != null) return parsed.millisecondsSinceEpoch ~/ 1000;
    return DateTime.now().millisecondsSinceEpoch ~/ 1000;
  }

  Map<String, dynamic> _candleToJson(CandleData c) {
    return {
      'time': _toUnix(c.timestamp),
      'open': c.open,
      'high': c.high,
      'low': c.low,
      'close': c.close,
      'volume': c.volume,
    };
  }

  @override
  Widget build(BuildContext context) {
    if (widget.candles.isEmpty) {
      return SizedBox(
        height: widget.height,
        child: const Center(
          child: Text('No chart data', style: TextStyle(color: Colors.grey)),
        ),
      );
    }

    return Container(
      height: widget.height,
      decoration: BoxDecoration(
        color: const Color(0xFF0B132B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Text(
              widget.timeframe,
              style: const TextStyle(
                color: Color(0xFF94A3B8),
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(child: WebViewWidget(controller: _controller)),
        ],
      ),
    );
  }
}
