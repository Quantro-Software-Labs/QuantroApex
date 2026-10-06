import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../core/services/market_service.dart';
import '../core/theme/app_colors.dart';

/// Controllable Lightweight Charts WebView for the Manual Trading Desk.
///
/// Bridge: `window.QuantroChart.setCandles / setOverlays / toggleOverlay`
/// plus `FlutterChannel` postMessage callbacks (`ready`, `overlayToggled`, …).
class TradingChartWidget extends StatefulWidget {
  final List<CandleData> candles;
  final double height;
  final bool expand;
  final String timeframe;
  final Map<String, dynamic>? overlays;
  final Map<String, bool>? overlayVisibility;
  final ValueChanged<Map<String, dynamic>>? onChannelMessage;

  const TradingChartWidget({
    super.key,
    required this.candles,
    this.height = 320,
    this.expand = false,
    this.timeframe = '1H',
    this.overlays,
    this.overlayVisibility,
    this.onChannelMessage,
  });

  @override
  State<TradingChartWidget> createState() => TradingChartWidgetState();
}

class TradingChartWidgetState extends State<TradingChartWidget> {
  late final WebViewController _controller;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.darkBackground)
      ..addJavaScriptChannel(
        'FlutterChannel',
        onMessageReceived: (JavaScriptMessage message) {
          try {
            final decoded = jsonDecode(message.message);
            if (decoded is Map<String, dynamic>) {
              if (decoded['type'] == 'ready') {
                _ready = true;
                _pushAll();
              }
              widget.onChannelMessage?.call(decoded);
            }
          } catch (_) {}
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            _ready = true;
            _pushAll();
          },
        ),
      );

    // Same asset path on mobile + Flutter web.
    if (kIsWeb) {
      _controller.loadFlutterAsset('assets/charts/tradingview_chart.html');
    } else {
      _controller.loadFlutterAsset('assets/charts/tradingview_chart.html');
    }
  }

  @override
  void didUpdateWidget(covariant TradingChartWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_ready) return;
    if (!identical(oldWidget.candles, widget.candles)) {
      setCandles(widget.candles);
    }
    if (!identical(oldWidget.overlays, widget.overlays)) {
      setOverlays(widget.overlays);
    }
    if (!mapEquals(oldWidget.overlayVisibility, widget.overlayVisibility)) {
      _applyVisibility(widget.overlayVisibility);
    }
  }

  Future<void> _pushAll() async {
    await setCandles(widget.candles);
    await setOverlays(widget.overlays);
    await _applyVisibility(widget.overlayVisibility);
  }

  Future<void> setCandles(List<CandleData> candles) async {
    if (!_ready) return;
    final candlesJson = jsonEncode(candles.map(_candleToJson).toList());
    await _controller.runJavaScript(
      'window.QuantroChart && window.QuantroChart.setCandles($candlesJson);',
    );
  }

  Future<void> setOverlays(Map<String, dynamic>? overlays) async {
    if (!_ready || overlays == null) return;
    final overlaysJson = jsonEncode(overlays);
    await _controller.runJavaScript(
      'window.QuantroChart && window.QuantroChart.setOverlays($overlaysJson);',
    );
  }

  Future<void> toggleOverlay(String name, bool enabled) async {
    if (!_ready) return;
    await _controller.runJavaScript(
      'window.QuantroChart && window.QuantroChart.toggleOverlay(${jsonEncode(name)}, $enabled);',
    );
  }

  Future<void> _applyVisibility(Map<String, bool>? visibility) async {
    if (visibility == null) return;
    for (final entry in visibility.entries) {
      await toggleOverlay(entry.key, entry.value);
    }
  }

  int _toUnix(String raw) {
    final asInt = int.tryParse(raw);
    if (asInt != null) {
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
      final empty = const Center(
        child: Text('No chart data', style: TextStyle(color: Color(0xFF64748B))),
      );
      return widget.expand
          ? empty
          : SizedBox(height: widget.height, child: empty);
    }

    final chart = Container(
      height: widget.expand ? null : widget.height,
      decoration: BoxDecoration(
        color: AppColors.darkBackground,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.darkBorder),
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

    return chart;
  }
}
