import 'package:flutter/foundation.dart';
import '../services/simulation_service.dart';

class SimulationProvider extends ChangeNotifier {
  final SimulationService _service;

  String _activeMode = 'SIM';
  double _cashBalance = 100000.0;
  double _equity = 100000.0;
  double _realizedPnl = 0.0;
  int _positionsCount = 0;

  bool _isLoading = false;
  bool _isResetting = false;
  String? _errorMessage;

  SimulationProvider({SimulationService? service})
      : _service = service ?? SimulationService() {
    fetchSimulationSummary();
  }

  String get activeMode => _activeMode;
  double get cashBalance => _cashBalance;
  double get equity => _equity;
  double get realizedPnl => _realizedPnl;
  int get positionsCount => _positionsCount;
  bool get isLoading => _isLoading;
  bool get isResetting => _isResetting;
  String? get errorMessage => _errorMessage;

  Future<void> fetchSimulationSummary() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final summary = await _service.getSummary();
      _activeMode = summary.activeMode;
      _cashBalance = summary.cashBalance;
      _equity = summary.equity;
      _realizedPnl = summary.realizedPnl;
      _positionsCount = summary.positionsCount;
    } catch (e) {
      _errorMessage = 'Failed to load simulation summary.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> toggleMode(String mode) async {
    try {
      _activeMode = await _service.toggleMode(mode);
      notifyListeners();
    } catch (e) {
      _errorMessage = 'Failed to switch execution mode.';
      notifyListeners();
    }
  }

  Future<bool> resetSimulation() async {
    _isResetting = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _service.resetSimulation();
      await fetchSimulationSummary();
      _isResetting = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Failed to reset simulation account.';
      _isResetting = false;
      notifyListeners();
      return false;
    }
  }

  Future<Map<String, dynamic>?> generateTicks({String? symbol}) async {
    try {
      final res = await _service.generateTicks(symbol: symbol);
      await fetchSimulationSummary();
      return res;
    } catch (e) {
      _errorMessage = 'Failed to generate simulated market ticks.';
      notifyListeners();
      return null;
    }
  }
}
