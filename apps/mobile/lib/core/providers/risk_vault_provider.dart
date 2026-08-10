import 'package:flutter/foundation.dart';
import '../services/risk_vault_service.dart';

class RiskVaultProvider extends ChangeNotifier {
  final RiskVaultService _service;

  RiskVaultData? _vault;
  bool _isLoading = false;
  String? _errorMessage;

  RiskVaultProvider({RiskVaultService? service})
      : _service = service ?? RiskVaultService() {
    fetchVault();
  }

  RiskVaultData? get vault => _vault;
  bool get isLoading => _isLoading;
  bool get isEmergencyStopped => _vault?.isEmergencyStopped ?? false;
  String? get errorMessage => _errorMessage;

  Future<void> fetchVault() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _vault = await _service.getVault();
    } catch (e) {
      _errorMessage = 'Failed to load Risk Vault configuration.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> updateVault({
    required double dailyLossLimit,
    required double maxDrawdown,
    required double perTradeExposure,
    required bool cryptoEnabled,
    required bool stocksEnabled,
    required bool forexEnabled,
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _vault = await _service.updateVault(
        dailyLossLimit: dailyLossLimit,
        maxDrawdown: maxDrawdown,
        perTradeExposure: perTradeExposure,
        cryptoEnabled: cryptoEnabled,
        stocksEnabled: stocksEnabled,
        forexEnabled: forexEnabled,
      );
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Failed to update Risk Vault limits.';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> triggerEmergencyStop() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final stoppedAt = await _service.triggerEmergencyStop();
      if (_vault != null) {
        _vault = RiskVaultData(
          id: _vault!.id,
          dailyLossLimit: _vault!.dailyLossLimit,
          maxDrawdown: _vault!.maxDrawdown,
          perTradeExposure: _vault!.perTradeExposure,
          cryptoEnabled: _vault!.cryptoEnabled,
          stocksEnabled: _vault!.stocksEnabled,
          forexEnabled: _vault!.forexEnabled,
          emergencyStoppedAt: stoppedAt,
        );
      }
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Failed to trigger Emergency Stop.';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> resumeTrading() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _vault = await _service.resumeTrading();
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Failed to resume trading.';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }
}
