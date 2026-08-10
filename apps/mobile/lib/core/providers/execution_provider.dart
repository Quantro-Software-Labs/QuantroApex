import 'package:flutter/foundation.dart';
import '../services/execution_service.dart';

class ExecutionProvider extends ChangeNotifier {
  final ExecutionService _service;

  List<PositionData> _positions = [];
  List<OrderData> _orders = [];
  bool _isLoading = false;
  bool _isExecuting = false;
  String? _errorMessage;

  ExecutionProvider({ExecutionService? service})
      : _service = service ?? ExecutionService() {
    fetchExecutionState();
  }

  List<PositionData> get positions => _positions;
  List<OrderData> get orders => _orders;
  bool get isLoading => _isLoading;
  bool get isExecuting => _isExecuting;
  String? get errorMessage => _errorMessage;

  Future<void> fetchExecutionState() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        _service.getPositions(),
        _service.getOrders(),
      ]);

      _positions = results[0] as List<PositionData>;
      _orders = results[1] as List<OrderData>;
    } catch (e) {
      _errorMessage = 'Failed to load execution data.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> placeOrder({
    required String symbol,
    required String side,
    required double quantity,
    double? limitPrice,
    String assetClass = 'STOCKS',
    String? aiReasoning,
  }) async {
    _isExecuting = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _service.placeOrder(
        symbol: symbol,
        side: side,
        quantity: quantity,
        limitPrice: limitPrice,
        assetClass: assetClass,
        aiReasoning: aiReasoning,
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
