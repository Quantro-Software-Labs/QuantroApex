import 'api_service.dart';
import 'auth_service.dart';

class RiskVaultData {
  final String id;
  final double dailyLossLimit;
  final double maxDrawdown;
  final double perTradeExposure;
  final bool cryptoEnabled;
  final bool stocksEnabled;
  final bool forexEnabled;
  final DateTime? emergencyStoppedAt;

  RiskVaultData({
    required this.id,
    required this.dailyLossLimit,
    required this.maxDrawdown,
    required this.perTradeExposure,
    required this.cryptoEnabled,
    required this.stocksEnabled,
    required this.forexEnabled,
    this.emergencyStoppedAt,
  });

  bool get isEmergencyStopped => emergencyStoppedAt != null;

  factory RiskVaultData.fromJson(Map<String, dynamic> json) {
    return RiskVaultData(
      id: json['id'] as String,
      dailyLossLimit: (json['dailyLossLimit'] is num)
          ? (json['dailyLossLimit'] as num).toDouble()
          : double.parse(json['dailyLossLimit'].toString()),
      maxDrawdown: (json['maxDrawdown'] is num)
          ? (json['maxDrawdown'] as num).toDouble()
          : double.parse(json['maxDrawdown'].toString()),
      perTradeExposure: (json['perTradeExposure'] is num)
          ? (json['perTradeExposure'] as num).toDouble()
          : double.parse(json['perTradeExposure'].toString()),
      cryptoEnabled: (json['cryptoEnabled'] as bool?) ?? false,
      stocksEnabled: (json['stocksEnabled'] as bool?) ?? true,
      forexEnabled: (json['forexEnabled'] as bool?) ?? false,
      emergencyStoppedAt: json['emergencyStoppedAt'] != null
          ? DateTime.tryParse(json['emergencyStoppedAt'] as String)
          : null,
    );
  }
}

class RiskVaultService {
  final ApiService _apiService;
  final AuthService _authService;

  RiskVaultService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<RiskVaultData> getVault() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/risk-vault', token: token);
    final vaultJson = (response as Map<String, dynamic>)['riskVault'] as Map<String, dynamic>;
    return RiskVaultData.fromJson(vaultJson);
  }

  Future<RiskVaultData> updateVault({
    required double dailyLossLimit,
    required double maxDrawdown,
    required double perTradeExposure,
    required bool cryptoEnabled,
    required bool stocksEnabled,
    required bool forexEnabled,
  }) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.post(
      '/risk-vault',
      token: token,
      body: {
        'dailyLossLimit': dailyLossLimit,
        'maxDrawdown': maxDrawdown,
        'perTradeExposure': perTradeExposure,
        'cryptoEnabled': cryptoEnabled,
        'stocksEnabled': stocksEnabled,
        'forexEnabled': forexEnabled,
      },
    );
    final vaultJson = (response as Map<String, dynamic>)['riskVault'] as Map<String, dynamic>;
    return RiskVaultData.fromJson(vaultJson);
  }

  Future<DateTime?> triggerEmergencyStop() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.post('/risk-vault/emergency-stop', token: token);
    final stoppedAtStr = response['emergencyStoppedAt'] as String?;
    return stoppedAtStr != null ? DateTime.tryParse(stoppedAtStr) : DateTime.now();
  }

  Future<RiskVaultData> resumeTrading() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.post('/risk-vault/resume', token: token);
    final vaultJson = (response as Map<String, dynamic>)['riskVault'] as Map<String, dynamic>;
    return RiskVaultData.fromJson(vaultJson);
  }
}
