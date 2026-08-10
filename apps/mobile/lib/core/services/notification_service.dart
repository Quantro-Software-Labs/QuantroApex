import 'api_service.dart';
import 'auth_service.dart';

class NotificationPreferencesData {
  final bool tradeAlerts;
  final bool riskAlerts;
  final String digestFrequency;
  final bool advisorySignals;

  NotificationPreferencesData({
    required this.tradeAlerts,
    required this.riskAlerts,
    required this.digestFrequency,
    required this.advisorySignals,
  });

  factory NotificationPreferencesData.fromJson(Map<String, dynamic> json) {
    return NotificationPreferencesData(
      tradeAlerts: (json['tradeAlerts'] as bool?) ?? true,
      riskAlerts: (json['riskAlerts'] as bool?) ?? true,
      digestFrequency: (json['digestFrequency'] as String?) ?? 'DAILY',
      advisorySignals: (json['advisorySignals'] as bool?) ?? true,
    );
  }
}

class AdvisorySignalData {
  final String id;
  final String symbol;
  final String side;
  final double quantity;
  final double estimatedPrice;
  final double confidence;
  final String reasoning;
  final DateTime createdAt;

  AdvisorySignalData({
    required this.id,
    required this.symbol,
    required this.side,
    required this.quantity,
    required this.estimatedPrice,
    required this.confidence,
    required this.reasoning,
    required this.createdAt,
  });

  factory AdvisorySignalData.fromJson(Map<String, dynamic> json) {
    return AdvisorySignalData(
      id: json['id'] as String,
      symbol: json['symbol'] as String,
      side: json['side'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      estimatedPrice: (json['estimatedPrice'] as num).toDouble(),
      confidence: (json['confidence'] as num).toDouble(),
      reasoning: json['reasoning'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class NotificationService {
  final ApiService _apiService;
  final AuthService _authService;

  NotificationService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<NotificationPreferencesData> getPreferences() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/notifications/preferences', token: token);
    final json = (response as Map<String, dynamic>)['preferences'] as Map<String, dynamic>;
    return NotificationPreferencesData.fromJson(json);
  }

  Future<NotificationPreferencesData> updatePreferences({
    bool? tradeAlerts,
    bool? riskAlerts,
    String? digestFrequency,
    bool? advisorySignals,
  }) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.put(
      '/notifications/preferences',
      token: token,
      body: {
        if (tradeAlerts != null) 'tradeAlerts': tradeAlerts,
        if (riskAlerts != null) 'riskAlerts': riskAlerts,
        if (digestFrequency != null) 'digestFrequency': digestFrequency,
        if (advisorySignals != null) 'advisorySignals': advisorySignals,
      },
    );
    final json = (response as Map<String, dynamic>)['preferences'] as Map<String, dynamic>;
    return NotificationPreferencesData.fromJson(json);
  }

  Future<void> registerFcmToken(String fcmToken) async {
    final token = await _authService.getAccessToken();
    await _apiService.post(
      '/notifications/fcm-token',
      token: token,
      body: {'fcmToken': fcmToken},
    );
  }

  Future<List<AdvisorySignalData>> getAdvisoryFeed() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/notifications/advisory-feed', token: token);
    final list = (response as Map<String, dynamic>)['signals'] as List<dynamic>;
    return list.map((json) => AdvisorySignalData.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<void> respondToAdvisorySignal({
    required String signalId,
    required String action,
    String? symbol,
    String? side,
    double? quantity,
  }) async {
    final token = await _authService.getAccessToken();
    await _apiService.post(
      '/notifications/advisory/respond',
      token: token,
      body: {
        'signalId': signalId,
        'action': action,
        if (symbol != null) 'symbol': symbol,
        if (side != null) 'side': side,
        if (quantity != null) 'quantity': quantity,
      },
    );
  }
}
