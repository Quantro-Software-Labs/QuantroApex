import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'auth_service.dart';
import 'api_service.dart';

/// Production-hardened WebSocket service.
///
/// Features:
///  - Exponential back-off with jitter (1s → 64s cap) on disconnect
///  - Ping/pong keepalive every 30 s to detect half-open TCP connections
///  - Event deduplication via a sliding 500-event LRU ID cache
///  - Clean lifecycle management: connect / disconnect / dispose
///  - Auth token refresh before each reconnect attempt
class WebSocketService {
  final AuthService _authService;
  final ApiService _apiService;

  WebSocket? _socket;
  final StreamController<Map<String, dynamic>> _eventController =
      StreamController<Map<String, dynamic>>.broadcast();

  // ── Reconnect state ────────────────────────────────────────────────────────
  bool _isConnected = false;
  bool _intentionalDisconnect = false;
  int _reconnectAttempts = 0;
  static const int _maxReconnectDelay = 64; // seconds
  static const int _baseReconnectDelay = 1; // seconds
  Timer? _reconnectTimer;

  // ── Keepalive ──────────────────────────────────────────────────────────────
  Timer? _pingTimer;
  static const Duration _pingInterval = Duration(seconds: 30);
  static const Duration _pongTimeout = Duration(seconds: 10);
  Timer? _pongTimeoutTimer;

  // ── Deduplication — sliding LRU cache ────────────────────────────────────
  final _seenEventIds = <String>{};
  final _seenEventIdQueue = <String>[];
  static const int _dedupCacheSize = 500;

  WebSocketService({
    AuthService? authService,
    ApiService? apiService,
  })  : _authService = authService ?? AuthService(),
        _apiService = apiService ?? ApiService();

  Stream<Map<String, dynamic>> get eventStream => _eventController.stream;
  bool get isConnected => _isConnected;

  String get _wsBase {
    final httpBase = _apiService.baseUrl;
    return httpBase
        .replaceAll('http://', 'ws://')
        .replaceAll('https://', 'wss://');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  Future<void> connect() async {
    if (_isConnected || _intentionalDisconnect) return;
    await _doConnect();
  }

  void disconnect() {
    _intentionalDisconnect = true;
    _cancelTimers();
    _socket?.close(WebSocketStatus.normalClosure);
    _isConnected = false;
    _reconnectAttempts = 0;
  }

  void dispose() {
    disconnect();
    _eventController.close();
  }

  // ── Internal connection logic ──────────────────────────────────────────────

  Future<void> _doConnect() async {
    try {
      // Always fetch a fresh token before connecting/reconnecting
      final token = await _authService.getAccessToken();
      if (token == null) {
        _scheduleReconnect();
        return;
      }

      final wsUrl = '$_wsBase/activity-feed/ws/events?token=${Uri.encodeComponent(token)}';
      _socket = await WebSocket.connect(
        wsUrl,
        headers: const {'User-Agent': 'QuantroApex-Flutter/1.0'},
      ).timeout(const Duration(seconds: 15));

      _isConnected = true;
      _reconnectAttempts = 0; // reset on successful connect
      _intentionalDisconnect = false;

      _socket!.listen(
        _onMessage,
        onDone: _onDisconnected,
        onError: (_) => _onDisconnected(),
        cancelOnError: false,
      );

      _startPing();
    } on SocketException catch (_) {
      _onDisconnected();
    } on TimeoutException catch (_) {
      _onDisconnected();
    } catch (_) {
      _onDisconnected();
    }
  }

  void _onMessage(dynamic raw) {
    // Cancel pong timeout — server is alive
    _pongTimeoutTimer?.cancel();

    if (raw is! String) return;

    Map<String, dynamic>? json;
    try {
      json = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return;
    }

    // Absorb pong frames
    if (json['type'] == 'PONG' || json['type'] == 'PING') return;

    // Deduplicate by event id if present
    final eventId = json['id'] as String? ?? json['eventId'] as String?;
    if (eventId != null) {
      if (_seenEventIds.contains(eventId)) return;
      _trackEventId(eventId);
    }

    if (!_eventController.isClosed) {
      _eventController.add(json);
    }
  }

  void _onDisconnected() {
    _isConnected = false;
    _cancelTimers();
    if (!_intentionalDisconnect) {
      _scheduleReconnect();
    }
  }

  // ── Reconnect with exponential back-off + jitter ──────────────────────────

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();

    final delaySeconds = math.min(
      _baseReconnectDelay * math.pow(2, _reconnectAttempts).toInt(),
      _maxReconnectDelay,
    );
    // Add ±20% jitter to avoid thundering-herd on server restart
    final jitter = (delaySeconds * 0.2 * (math.Random().nextDouble() - 0.5)).round();
    final totalDelay = Duration(seconds: (delaySeconds + jitter).clamp(1, _maxReconnectDelay));

    _reconnectAttempts++;

    _reconnectTimer = Timer(totalDelay, () async {
      if (!_intentionalDisconnect) {
        await _doConnect();
      }
    });
  }

  // ── Ping / pong keepalive ─────────────────────────────────────────────────

  void _startPing() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(_pingInterval, (_) => _sendPing());
  }

  void _sendPing() {
    if (_socket == null || !_isConnected) return;
    try {
      _socket!.add(jsonEncode({'type': 'PING', 'ts': DateTime.now().millisecondsSinceEpoch}));
      // Expect a PONG back within 10 seconds
      _pongTimeoutTimer?.cancel();
      _pongTimeoutTimer = Timer(_pongTimeout, () {
        // No pong — connection is half-open, force reconnect
        _socket?.close();
        _onDisconnected();
      });
    } catch (_) {
      _onDisconnected();
    }
  }

  // ── Dedup LRU helper ──────────────────────────────────────────────────────

  void _trackEventId(String id) {
    _seenEventIds.add(id);
    _seenEventIdQueue.add(id);
    if (_seenEventIdQueue.length > _dedupCacheSize) {
      final oldest = _seenEventIdQueue.removeAt(0);
      _seenEventIds.remove(oldest);
    }
  }

  void _cancelTimers() {
    _reconnectTimer?.cancel();
    _pingTimer?.cancel();
    _pongTimeoutTimer?.cancel();
  }
}
