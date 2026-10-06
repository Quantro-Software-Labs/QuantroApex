import 'api_service.dart';
import 'auth_service.dart';

class StockQuoteData {
  final String symbol;
  final String name;
  final double price;
  final double change24h;
  final double changePct24h;
  final double high24h;
  final double low24h;
  final int volume;
  final String marketCap;
  final double peRatio;
  final String sector;
  final String assetClass;

  StockQuoteData({
    required this.symbol,
    required this.name,
    required this.price,
    required this.change24h,
    required this.changePct24h,
    required this.high24h,
    required this.low24h,
    required this.volume,
    required this.marketCap,
    required this.peRatio,
    required this.sector,
    required this.assetClass,
  });

  factory StockQuoteData.fromJson(Map<String, dynamic> json) {
    return StockQuoteData(
      symbol: json['symbol'] ?? '',
      name: json['name'] ?? '',
      price: (json['price'] as num?)?.toDouble() ?? 0.0,
      change24h: (json['change24h'] as num?)?.toDouble() ?? 0.0,
      changePct24h: (json['changePct24h'] as num?)?.toDouble() ?? 0.0,
      high24h: (json['high24h'] as num?)?.toDouble() ?? 0.0,
      low24h: (json['low24h'] as num?)?.toDouble() ?? 0.0,
      volume: (json['volume'] as num?)?.toInt() ?? 0,
      marketCap: json['marketCap'] ?? '',
      peRatio: (json['peRatio'] as num?)?.toDouble() ?? 0.0,
      sector: json['sector'] ?? 'General Market',
      assetClass: json['assetClass'] ?? 'STOCKS',
    );
  }
}

class CandleData {
  final String timestamp;
  final double open;
  final double high;
  final double low;
  final double close;
  final int volume;

  CandleData({
    required this.timestamp,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.volume,
  });

  factory CandleData.fromJson(Map<String, dynamic> json) {
    return CandleData(
      timestamp: json['timestamp'] ?? '',
      open: (json['open'] as num?)?.toDouble() ?? 0.0,
      high: (json['high'] as num?)?.toDouble() ?? 0.0,
      low: (json['low'] as num?)?.toDouble() ?? 0.0,
      close: (json['close'] as num?)?.toDouble() ?? 0.0,
      volume: (json['volume'] as num?)?.toInt() ?? 0,
    );
  }
}

class TechnicalIndicatorsData {
  final double rsi;
  final double macd;
  final double sma20;
  final double sma50;
  final double supportLevel;
  final double resistanceLevel;
  final String trend;

  TechnicalIndicatorsData({
    required this.rsi,
    required this.macd,
    required this.sma20,
    required this.sma50,
    required this.supportLevel,
    required this.resistanceLevel,
    required this.trend,
  });

  factory TechnicalIndicatorsData.fromJson(Map<String, dynamic> json) {
    return TechnicalIndicatorsData(
      rsi: (json['rsi'] as num?)?.toDouble() ?? 50.0,
      macd: (json['macd'] as num?)?.toDouble() ?? 0.0,
      sma20: (json['sma20'] as num?)?.toDouble() ?? 0.0,
      sma50: (json['sma50'] as num?)?.toDouble() ?? 0.0,
      supportLevel: (json['supportLevel'] as num?)?.toDouble() ?? 0.0,
      resistanceLevel: (json['resistanceLevel'] as num?)?.toDouble() ?? 0.0,
      trend: json['trend'] ?? 'NEUTRAL',
    );
  }
}

class StockDetailResponse {
  final StockQuoteData stock;
  final TechnicalIndicatorsData technicals;
  final List<CandleData> candles;

  StockDetailResponse({
    required this.stock,
    required this.technicals,
    required this.candles,
  });
}

class AiStudyResponse {
  final String symbol;
  final String name;
  final double price;
  final String studyText;
  final String recommendation;
  final double confidenceScore;

  AiStudyResponse({
    required this.symbol,
    required this.name,
    required this.price,
    required this.studyText,
    required this.recommendation,
    required this.confidenceScore,
  });

  factory AiStudyResponse.fromJson(Map<String, dynamic> json) {
    return AiStudyResponse(
      symbol: json['symbol'] ?? '',
      name: json['name'] ?? '',
      price: (json['price'] as num?)?.toDouble() ?? 0.0,
      studyText: json['studyText'] ?? '',
      recommendation: json['recommendation'] ?? 'HOLD',
      confidenceScore: (json['confidenceScore'] as num?)?.toDouble() ?? 0.85,
    );
  }
}

class MarketSentimentData {
  final int score;
  final String label;
  final String summary;
  final int bullishCount;
  final int bearishCount;
  final double averageChangePct;

  MarketSentimentData({
    required this.score,
    required this.label,
    required this.summary,
    required this.bullishCount,
    required this.bearishCount,
    required this.averageChangePct,
  });

  factory MarketSentimentData.fromJson(Map<String, dynamic> json) {
    final s = json['sentiment'] as Map<String, dynamic>? ?? json;
    return MarketSentimentData(
      score: (s['score'] as num?)?.toInt() ?? 50,
      label: s['label'] as String? ?? 'Neutral',
      summary: s['summary'] as String? ?? '',
      bullishCount: (s['bullishCount'] as num?)?.toInt() ?? 0,
      bearishCount: (s['bearishCount'] as num?)?.toInt() ?? 0,
      averageChangePct: (s['averageChangePct'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class LearningStatsResponse {
  final int totalSamples;
  final int winCount;
  final double winRate;
  final Map<String, int> breakdown;
  final double modelReadinessPct;

  LearningStatsResponse({
    required this.totalSamples,
    required this.winCount,
    required this.winRate,
    required this.breakdown,
    required this.modelReadinessPct,
  });

  factory LearningStatsResponse.fromJson(Map<String, dynamic> json) {
    final user = json['user'] ?? {};
    final bd = user['breakdown'] as Map<String, dynamic>? ?? {};
    return LearningStatsResponse(
      totalSamples: (user['totalSamples'] as num?)?.toInt() ?? 0,
      winCount: (user['winCount'] as num?)?.toInt() ?? 0,
      winRate: (user['winRate'] as num?)?.toDouble() ?? 0.0,
      breakdown: {
        'stocks': (bd['stocks'] as num?)?.toInt() ?? 0,
        'forex': (bd['forex'] as num?)?.toInt() ?? 0,
        'crypto': (bd['crypto'] as num?)?.toInt() ?? 0,
      },
      modelReadinessPct: (user['modelReadinessPct'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class MarketService {
  final ApiService _apiService;
  final AuthService _authService;

  MarketService({ApiService? apiService, AuthService? authService})
      : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<String?> _token() => _authService.getAccessToken();

  Future<List<StockQuoteData>> getStocks({String? assetClass, String? token}) async {
    final authToken = token ?? await _token();
    final path = assetClass != null && assetClass != 'ALL'
        ? '/market/stocks?assetClass=$assetClass'
        : '/market/stocks';
    final response = await _apiService.get(path, token: authToken);
    final list = response['stocks'] as List<dynamic>? ?? [];
    return list.map((item) => StockQuoteData.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<List<StockQuoteData>> getTicker({String? token}) async {
    final authToken = token ?? await _token();
    final response = await _apiService.get('/market/ticker', token: authToken);
    final list = response['ticker'] as List<dynamic>? ?? [];
    return list.map((item) => StockQuoteData.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<MarketSentimentData> getSentiment({String? token}) async {
    final authToken = token ?? await _token();
    final response = await _apiService.get('/market/sentiment', token: authToken);
    return MarketSentimentData.fromJson(response as Map<String, dynamic>);
  }

  Future<StockDetailResponse> getStockDetail(String symbol, {String? token}) async {
    final authToken = token ?? await _token();
    final encodedSymbol = Uri.encodeComponent(symbol);
    final response = await _apiService.get('/market/stocks/$encodedSymbol', token: authToken);
    final stock = StockQuoteData.fromJson(response['stock'] as Map<String, dynamic>);
    final technicals = TechnicalIndicatorsData.fromJson(response['technicals'] as Map<String, dynamic>);
    final candleList = (response['candles'] as List<dynamic>? ?? [])
        .map((c) => CandleData.fromJson(c as Map<String, dynamic>))
        .toList();

    return StockDetailResponse(
      stock: stock,
      technicals: technicals,
      candles: candleList,
    );
  }

  Future<AiStudyResponse> generateAiStudy(String symbol, {String? token}) async {
    final authToken = token ?? await _token();
    final response = await _apiService.post(
      '/market/ai-study',
      body: {'symbol': symbol},
      token: authToken,
    );
    return AiStudyResponse.fromJson(response as Map<String, dynamic>);
  }

  Future<LearningStatsResponse> getLearningStats({String? token}) async {
    final authToken = token ?? await _token();
    final response = await _apiService.get('/learning/stats', token: authToken);
    return LearningStatsResponse.fromJson(response as Map<String, dynamic>);
  }
}
