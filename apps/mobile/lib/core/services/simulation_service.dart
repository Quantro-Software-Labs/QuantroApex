import 'api_service.dart';
import 'auth_service.dart';

class SimulationSummary {
  final String activeMode;
  final double cashBalance;
  final double equity;
  final double realizedPnl;
  final int positionsCount;

  SimulationSummary({
    required this.activeMode,
    required this.cashBalance,
    required this.equity,
    required this.realizedPnl,
    required this.positionsCount,
  });

  factory SimulationSummary.fromJson(Map<String, dynamic> json) {
    final sim = json['simPortfolio'] as Map<String, dynamic>;
    return SimulationSummary(
      activeMode: (json['activeMode'] as String?) ?? 'SIM',
      cashBalance: (sim['cashBalance'] is num)
          ? (sim['cashBalance'] as num).toDouble()
          : double.parse(sim['cashBalance'].toString()),
      equity: (sim['equity'] is num)
          ? (sim['equity'] as num).toDouble()
          : double.parse(sim['equity'].toString()),
      realizedPnl: (sim['realizedPnl'] is num)
          ? (sim['realizedPnl'] as num).toDouble()
          : double.parse(sim['realizedPnl'].toString()),
      positionsCount: (sim['positionsCount'] as num).toInt(),
    );
  }
}

class SimulationService {
  final ApiService _apiService;
  final AuthService _authService;

  SimulationService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<SimulationSummary> getSummary() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/simulation/summary', token: token);
    return SimulationSummary.fromJson(response as Map<String, dynamic>);
  }

  Future<String> toggleMode(String mode) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.post(
      '/simulation/toggle-mode',
      token: token,
      body: {'mode': mode},
    );
    return (response as Map<String, dynamic>)['mode'] as String;
  }

  Future<void> resetSimulation({double? startingCapital}) async {
    final token = await _authService.getAccessToken();
    await _apiService.post(
      '/simulation/reset',
      token: token,
      body: startingCapital != null ? {'startingCapital': startingCapital} : {},
    );
  }

  Future<Map<String, dynamic>> generateTicks({String? symbol}) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.post(
      '/simulation/generate-ticks',
      token: token,
      body: symbol != null ? {'symbol': symbol} : {},
    );
    return response as Map<String, dynamic>;
  }
}
