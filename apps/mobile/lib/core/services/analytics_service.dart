import 'api_service.dart';
import 'auth_service.dart';

class PerformanceMetricsData {
  final int totalTrades;
  final int winningTrades;
  final int losingTrades;
  final double winRate;
  final double profitFactor;
  final double sharpeRatio;
  final double maxDrawdown;
  final double totalRealizedPnl;
  final double currentEquity;

  PerformanceMetricsData({
    required this.totalTrades,
    required this.winningTrades,
    required this.losingTrades,
    required this.winRate,
    required this.profitFactor,
    required this.sharpeRatio,
    required this.maxDrawdown,
    required this.totalRealizedPnl,
    required this.currentEquity,
  });

  factory PerformanceMetricsData.fromJson(Map<String, dynamic> json) {
    return PerformanceMetricsData(
      totalTrades: (json['totalTrades'] as num).toInt(),
      winningTrades: (json['winningTrades'] as num).toInt(),
      losingTrades: (json['losingTrades'] as num).toInt(),
      winRate: (json['winRate'] as num).toDouble(),
      profitFactor: (json['profitFactor'] as num).toDouble(),
      sharpeRatio: (json['sharpeRatio'] as num).toDouble(),
      maxDrawdown: (json['maxDrawdown'] as num).toDouble(),
      totalRealizedPnl: (json['totalRealizedPnl'] as num).toDouble(),
      currentEquity: (json['currentEquity'] as num).toDouble(),
    );
  }
}

class EquityPointData {
  final String timestamp;
  final double equity;
  final double benchmark;

  EquityPointData({
    required this.timestamp,
    required this.equity,
    required this.benchmark,
  });

  factory EquityPointData.fromJson(Map<String, dynamic> json) {
    return EquityPointData(
      timestamp: json['timestamp'] as String,
      equity: (json['equity'] as num).toDouble(),
      benchmark: (json['benchmark'] as num).toDouble(),
    );
  }
}

class TradeHistoryItem {
  final String id;
  final String symbol;
  final String side;
  final String orderType;
  final double fillQuantity;
  final double fillPrice;
  final double realizedPnl;
  final String? aiReasoning;
  final DateTime filledAt;

  TradeHistoryItem({
    required this.id,
    required this.symbol,
    required this.side,
    required this.orderType,
    required this.fillQuantity,
    required this.fillPrice,
    required this.realizedPnl,
    this.aiReasoning,
    required this.filledAt,
  });

  factory TradeHistoryItem.fromJson(Map<String, dynamic> json) {
    return TradeHistoryItem(
      id: json['id'] as String,
      symbol: json['symbol'] as String,
      side: json['side'] as String,
      orderType: (json['orderType'] as String?) ?? 'MARKET',
      fillQuantity: (json['fillQuantity'] as num).toDouble(),
      fillPrice: (json['fillPrice'] as num).toDouble(),
      realizedPnl: (json['realizedPnl'] as num).toDouble(),
      aiReasoning: json['aiReasoning'] as String?,
      filledAt: DateTime.parse(json['filledAt'] as String),
    );
  }
}

class AnalyticsService {
  final ApiService _apiService;
  final AuthService _authService;

  AnalyticsService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<PerformanceMetricsData> getMetrics() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/analytics/metrics', token: token);
    final json = (response as Map<String, dynamic>)['metrics'] as Map<String, dynamic>;
    return PerformanceMetricsData.fromJson(json);
  }

  Future<List<EquityPointData>> getEquityCurve(String timeframe) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/analytics/equity-curve?timeframe=$timeframe', token: token);
    final list = (response as Map<String, dynamic>)['points'] as List<dynamic>;
    return list.map((json) => EquityPointData.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<List<TradeHistoryItem>> getTradeHistory() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/analytics/trade-history', token: token);
    final list = (response as Map<String, dynamic>)['trades'] as List<dynamic>;
    return list.map((json) => TradeHistoryItem.fromJson(json as Map<String, dynamic>)).toList();
  }
}
