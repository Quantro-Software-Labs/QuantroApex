import 'package:flutter/foundation.dart';
import '../services/execution_service.dart';

class ExecutionProvider extends ChangeNotifier {
  final ExecutionService _service;

  List<PositionData> _positions = [];
  List<OrderData> _orders = [];
  bool _isLoading = false;
  bool _isExecuting = false;
  bool _isBrokerConnected = false;
  String? _maskedApiKey;
  String? _errorMessage;

  ExecutionProvider({ExecutionService? service})
      : _service = service ?? ExecutionService();

  List<PositionData> get positions => _positions;
  List<OrderData> get orders => _orders;
  bool get isLoading => _isLoading;
  bool get isExecuting => _isExecuting;
  bool get isBrokerConnected => _isBrokerConnected;
  String? get maskedApiKey => _maskedApiKey;
  String? get errorMessage => _errorMessage;

  Future<void> fetchExecutionState({bool silent = false}) async {
    if (!silent) {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();
    }

    try {
      final results = await Future.wait([
        _service.getPositions(),
        _service.getOrders(),
        _service.getBrokerCredentials(),
      ]);

      _positions = results[0] as List<PositionData>;
      _orders = results[1] as List<OrderData>;

      final creds = results[2] as Map<String, dynamic>;
      _isBrokerConnected = (creds['isBrokerConnected'] as bool?) ?? false;
      _maskedApiKey = creds['maskedApiKey'] as String?;
    } catch (e) {
      if (!silent) _errorMessage = 'Failed to load execution data.';
    } finally {
      if (!silent) _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> saveBrokerCredentials({
    required String apiKey,
    required String secretKey,
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await _service.saveBrokerCredentials(apiKey: apiKey, secretKey: secretKey);
      _isBrokerConnected = (res['isBrokerConnected'] as bool?) ?? true;
      _maskedApiKey = res['maskedApiKey'] as String?;
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Failed to save Alpaca credentials.';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> disconnectBroker() async {
    _isLoading = true;
    notifyListeners();

    try {
      await _service.disconnectBroker();
      _isBrokerConnected = false;
      _maskedApiKey = null;
    } catch (e) {
      _errorMessage = 'Failed to disconnect broker.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> placeOrder({
    required String symbol,
    required String side,
    required double quantity,
    String orderType = 'MARKET',
    double? limitPrice,
    double? stopPrice,
    double? trailingAmount,
    double? takeProfit,
    double? stopLoss,
    bool isOco = false,
    String owner = 'APEX',
    String assetClass = 'STOCKS',
    String? aiReasoning,
    bool isSimulated = true,
  }) async {
    _isExecuting = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _service.placeOrder(
        symbol: symbol,
        side: side,
        quantity: quantity,
        orderType: orderType,
        limitPrice: limitPrice,
        stopPrice: stopPrice,
        trailingAmount: trailingAmount,
        takeProfit: takeProfit,
        stopLoss: stopLoss,
        isOco: isOco,
        owner: owner,
        assetClass: assetClass,
        aiReasoning: aiReasoning,
        isSimulated: isSimulated,
      );
      await fetchExecutionState();
      _isExecuting = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Order execution failed or was rejected by Risk Vault.';
      _isExecuting = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> cancelOrder(String orderId) async {
    try {
      await _service.cancelOrder(orderId);
      await fetchExecutionState();
    } catch (e) {
      _errorMessage = 'Failed to cancel order.';
      notifyListeners();
    }
  }
}
