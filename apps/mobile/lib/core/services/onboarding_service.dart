import 'api_service.dart';
import 'auth_service.dart';

class OnboardingService {
  final ApiService _apiService;
  final AuthService _authService;

  OnboardingService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<Map<String, dynamic>?> getProgress() async {
    final token = await _authService.getAccessToken();
    if (token == null) return null;
    final res = await _apiService.get('/onboarding/progress', token: token);
    return res as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> setPath({
    required String path,
    String? experienceLevel,
  }) async {
    final token = await _authService.getAccessToken();
    final res = await _apiService.post(
      '/onboarding/path',
      token: token,
      body: {
        'path': path,
        if (experienceLevel != null) 'experienceLevel': experienceLevel,
      },
    );
    return res as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> saveStep({
    required int currentStep,
    Map<String, dynamic>? state,
  }) async {
    final token = await _authService.getAccessToken();
    final res = await _apiService.post(
      '/onboarding/step',
      token: token,
      body: {
        'currentStep': currentStep,
        if (state != null) 'state': state,
      },
    );
    return res as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> completeOnboarding({
    required String experienceLevel,
    required bool globalBrainConsent,
    Map<String, dynamic>? riskProfile,
    required double tradingCapital,
    required String preferredTradingMode,
    String? strategyId,
    required double dailyLossLimit,
    required double maxDrawdown,
    required double perTradeExposure,
    required bool cryptoEnabled,
    required bool stocksEnabled,
    required bool forexEnabled,
    required String digestInterval,
    required bool milestoneAlerts,
    double? lossThresholdPct,
    required bool lossAlertsEnabled,
    required bool pushEnabled,
  }) async {
    final token = await _authService.getAccessToken();
    final res = await _apiService.post(
      '/onboarding/complete',
      token: token,
      body: {
        'experienceLevel': experienceLevel,
        'globalBrainConsent': globalBrainConsent,
        if (riskProfile != null) 'riskProfile': riskProfile,
        'tradingCapital': tradingCapital,
        'preferredTradingMode': preferredTradingMode,
        if (strategyId != null) 'strategyId': strategyId,
        'riskVault': {
          'dailyLossLimit': dailyLossLimit,
          'maxDrawdown': maxDrawdown,
          'perTradeExposure': perTradeExposure,
          'cryptoEnabled': cryptoEnabled,
          'stocksEnabled': stocksEnabled,
          'forexEnabled': forexEnabled,
        },
        'notificationPrefs': {
          'digestInterval': digestInterval,
          'milestoneAlerts': milestoneAlerts,
          if (lossThresholdPct != null) 'lossThresholdPct': lossThresholdPct,
          'lossAlertsEnabled': lossAlertsEnabled,
          'pushEnabled': pushEnabled,
        },
      },
    );
    return res as Map<String, dynamic>;
  }
}
