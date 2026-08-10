import 'api_service.dart';
import 'auth_service.dart';

class PositionData {
  final String id;
  final String symbol;
  final double quantity;
  final double averageCost;

  PositionData({
    required this.id,
    required this.symbol,
    required this.quantity,
    required this.averageCost,
  });

  factory PositionData.fromJson(Map<String, dynamic> json) {
    return PositionData(
      id: json['id'] as String,
      symbol: json['symbol'] as String,
      quantity: (json['quantity'] is num)
          ? (json['quantity'] as num).toDouble()
          : double.parse(json['quantity'].toString()),
      averageCost: (json['averageCost'] is num)
          ? (json['averageCost'] as num).toDouble()
          : double.parse(json['averageCost'].toString()),
    );
  }
}

class OrderData {
  final String id;
  final String symbol;
  final String side;
  final String orderType;
  final double quantity;
  final double? limitPrice;
  final String status;
  final bool isSimulated;
  final DateTime createdAt;

  OrderData({
    required this.id,
    required this.symbol,
    required this.side,
    required this.orderType,
    required this.quantity,
    this.limitPrice,
    required this.status,
    required this.isSimulated,
    required this.createdAt,
  });

  factory OrderData.fromJson(Map<String, dynamic> json) {
    return OrderData(
      id: json['id'] as String,
      symbol: json['symbol'] as String,
      side: json['side'] as String,
      orderType: (json['orderType'] as String?) ?? 'MARKET',
      quantity: (json['quantity'] is num)
          ? (json['quantity'] as num).toDouble()
          : double.parse(json['quantity'].toString()),
      limitPrice: json['limitPrice'] != null
          ? ((json['limitPrice'] is num)
              ? (json['limitPrice'] as num).toDouble()
              : double.parse(json['limitPrice'].toString()))
          : null,
      status: json['status'] as String,
      isSimulated: (json['isSimulated'] as bool?) ?? true,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class ExecutionService {
  final ApiService _apiService;
  final AuthService _authService;

  ExecutionService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<List<PositionData>> getPositions() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/execution/positions', token: token);
    final list = (response as Map<String, dynamic>)['positions'] as List<dynamic>;
    return list.map((json) => PositionData.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<List<OrderData>> getOrders() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/execution/orders', token: token);
    final list = (response as Map<String, dynamic>)['orders'] as List<dynamic>;
    return list.map((json) => OrderData.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> placeOrder({
    required String symbol,
    required String side,
    required double quantity,
    double? limitPrice,
    String assetClass = 'STOCKS',
    String? aiReasoning,
  }) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.post(
      '/execution/order',
      token: token,
      body: {
        'symbol': symbol,
        'side': side,
        'orderType': limitPrice != null ? 'LIMIT' : 'MARKET',
        'quantity': quantity,
        if (limitPrice != null) 'limitPrice': limitPrice,
        'assetClass': assetClass,
        if (aiReasoning != null) 'aiReasoning': aiReasoning,
      },
    );
    return response as Map<String, dynamic>;
  }

  Future<void> cancelOrder(String orderId) async {
    final token = await _authService.getAccessToken();
    await _apiService.post('/execution/orders/$orderId/cancel', token: token);
  }
}
