import 'package:flutter/foundation.dart';
import '../services/strategy_service.dart';

class StrategyProvider extends ChangeNotifier {
  final StrategyService _service;

  List<StrategyData> _strategies = [];
  List<StrategyData> _recommendedStrategies = [];
  StrategyData? _selectedStrategyDetail;

  String _assetClassFilter = 'ALL';
  String _riskLevelFilter = 'ALL';

  bool _isLoading = false;
  bool _isSelecting = false;
  String? _errorMessage;

  StrategyProvider({StrategyService? service})
      : _service = service ?? StrategyService() {
    loadMarketplace();
  }

  List<StrategyData> get strategies => _strategies;
  List<StrategyData> get recommendedStrategies => _recommendedStrategies;
  StrategyData? get selectedStrategyDetail => _selectedStrategyDetail;
  String get assetClassFilter => _assetClassFilter;
  String get riskLevelFilter => _riskLevelFilter;
  bool get isLoading => _isLoading;
  bool get isSelecting => _isSelecting;
  String? get errorMessage => _errorMessage;

  Future<void> loadMarketplace() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        _service.getStrategies(
          assetClass: _assetClassFilter,
          riskLevel: _riskLevelFilter,
        ),
        _service.getRecommendedStrategies(),
      ]);

      _strategies = results[0];
      _recommendedStrategies = results[1];
    } catch (e) {
      _errorMessage = 'Failed to load strategy marketplace.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void setFilters({String? assetClass, String? riskLevel}) {
    if (assetClass != null) _assetClassFilter = assetClass;
    if (riskLevel != null) _riskLevelFilter = riskLevel;
    loadMarketplace();
  }

  Future<void> fetchStrategyDetail(String id) async {
    try {
      _selectedStrategyDetail = await _service.getStrategyDetail(id);
      notifyListeners();
    } catch (e) {
      _errorMessage = 'Failed to load strategy details.';
      notifyListeners();
    }
  }

  Future<bool> activateStrategy(String strategyId) async {
    _isSelecting = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _service.selectStrategy(strategyId);
      _isSelecting = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Failed to activate strategy.';
      _isSelecting = false;
      notifyListeners();
      return false;
    }
  }
}
