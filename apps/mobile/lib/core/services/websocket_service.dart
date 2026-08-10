import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'auth_service.dart';

class WebSocketService {
  final AuthService _authService;
  WebSocket? _socket;
  final StreamController<Map<String, dynamic>> _eventController =
      StreamController<Map<String, dynamic>>.broadcast();

  bool _isConnected = false;
  Timer? _reconnectTimer;

  WebSocketService({AuthService? authService})
      : _authService = authService ?? AuthService();

  Stream<Map<String, dynamic>> get eventStream => _eventController.stream;
  bool get isConnected => _isConnected;

  Future<void> connect() async {
    if (_isConnected) return;

    try {
      final token = await _authService.getAccessToken();
      if (token == null) return;

      final wsUrl = 'ws://localhost:3000/activity-feed/ws/events?token=$token';
      _socket = await WebSocket.connect(wsUrl);
      _isConnected = true;

      _socket!.listen(
        (data) {
          try {
            final json = jsonDecode(data as String) as Map<String, dynamic>;
            _eventController.add(json);
          } catch (_) {}
        },
        onDone: () {
          _isConnected = false;
          _scheduleReconnect();
        },
        onError: (err) {
          _isConnected = false;
          _scheduleReconnect();
        },
      );
    } catch (_) {
      _isConnected = false;
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      connect();
    });
  }

  void disconnect() {
    _reconnectTimer?.cancel();
    _socket?.close();
    _isConnected = false;
  }
}
