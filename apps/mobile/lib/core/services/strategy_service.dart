import 'api_service.dart';
import 'auth_service.dart';

class BacktestSummary {
  final double winRate;
  final double annualizedReturn;
  final double maxDrawdown;
  final double sharpeRatio;
  final int totalTrades;

  BacktestSummary({
    required this.winRate,
    required this.annualizedReturn,
    required this.maxDrawdown,
    required this.sharpeRatio,
    required this.totalTrades,
  });

  factory BacktestSummary.fromJson(Map<String, dynamic> json) {
    return BacktestSummary(
      winRate: (json['winRate'] as num).toDouble(),
      annualizedReturn: (json['annualizedReturn'] as num).toDouble(),
      maxDrawdown: (json['maxDrawdown'] as num).toDouble(),
      sharpeRatio: (json['sharpeRatio'] as num).toDouble(),
      totalTrades: (json['totalTrades'] as num).toInt(),
    );
  }
}

class StrategyData {
  final String id;
  final String slug;
  final String name;
  final String description;
  final String assetClass;
  final String riskLevel;
  final String style;
  final Map<String, dynamic> rules;
  final BacktestSummary backtestSummary;
  final int activeUserCount;
  final bool isPremium;

  StrategyData({
    required this.id,
    required this.slug,
    required this.name,
    required this.description,
    required this.assetClass,
    required this.riskLevel,
    required this.style,
    required this.rules,
    required this.backtestSummary,
    required this.activeUserCount,
    required this.isPremium,
  });

  factory StrategyData.fromJson(Map<String, dynamic> json) {
    return StrategyData(
      id: json['id'] as String,
      slug: json['slug'] as String,
      name: json['name'] as String,
      description: json['description'] as String,
      assetClass: json['assetClass'] as String,
      riskLevel: json['riskLevel'] as String,
      style: json['style'] as String,
      rules: (json['rules'] as Map<String, dynamic>?) ?? {},
      backtestSummary: BacktestSummary.fromJson(
        json['backtestSummary'] as Map<String, dynamic>,
      ),
      activeUserCount: (json['activeUserCount'] as num).toInt(),
      isPremium: (json['isPremium'] as bool?) ?? false,
    );
  }
}

class StrategyService {
  final ApiService _apiService;
  final AuthService _authService;

  StrategyService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<List<StrategyData>> getStrategies({
    String? assetClass,
    String? riskLevel,
  }) async {
    final token = await _authService.getAccessToken();
    final queryParams = <String>[];
    if (assetClass != null && assetClass.isNotEmpty && assetClass != 'ALL') {
      queryParams.add('assetClass=$assetClass');
    }
    if (riskLevel != null && riskLevel.isNotEmpty && riskLevel != 'ALL') {
      queryParams.add('riskLevel=$riskLevel');
    }

    final queryString = queryParams.isNotEmpty ? '?${queryParams.join('&')}' : '';
    final response = await _apiService.get('/strategies$queryString', token: token);
    final list = (response as Map<String, dynamic>)['strategies'] as List<dynamic>;
    return list.map((json) => StrategyData.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<List<StrategyData>> getRecommendedStrategies() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/strategies/recommended', token: token);
    final list = (response as Map<String, dynamic>)['recommended'] as List<dynamic>;
    return list.map((json) => StrategyData.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<StrategyData> getStrategyDetail(String id) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/strategies/$id', token: token);
    final json = (response as Map<String, dynamic>)['strategy'] as Map<String, dynamic>;
    return StrategyData.fromJson(json);
  }

  Future<void> selectStrategy(String strategyId) async {
    final token = await _authService.getAccessToken();
    await _apiService.post(
      '/strategies/select',
      token: token,
      body: {'strategyId': strategyId},
    );
  }
}
