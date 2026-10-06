import 'package:flutter/foundation.dart';
import '../services/analytics_service.dart';

class AnalyticsProvider extends ChangeNotifier {
  final AnalyticsService _service;

  String _selectedTimeframe = '1M';
  PerformanceMetricsData? _metrics;
  List<EquityPointData> _equityCurve = [];
  List<TradeHistoryItem> _tradeHistory = [];

  bool _isLoading = false;
  String? _errorMessage;

  AnalyticsProvider({AnalyticsService? service})
      : _service = service ?? AnalyticsService();

  String get selectedTimeframe => _selectedTimeframe;
  PerformanceMetricsData? get metrics => _metrics;
  List<EquityPointData> get equityCurve => _equityCurve;
  List<TradeHistoryItem> get tradeHistory => _tradeHistory;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  Future<void> loadAnalytics({bool silent = false}) async {
    if (!silent) {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();
    }

    try {
      final results = await Future.wait([
        _service.getMetrics(),
        _service.getEquityCurve(_selectedTimeframe),
        _service.getTradeHistory(),
      ]);

      _metrics = results[0] as PerformanceMetricsData;
      _equityCurve = results[1] as List<EquityPointData>;
      _tradeHistory = results[2] as List<TradeHistoryItem>;
    } catch (e) {
      if (!silent) _errorMessage = 'Failed to load analytics data.';
    } finally {
      if (!silent) _isLoading = false;
      notifyListeners();
    }
  }

  void setTimeframe(String timeframe) {
    if (_selectedTimeframe == timeframe) return;
    _selectedTimeframe = timeframe;
    loadAnalytics();
  }
}
