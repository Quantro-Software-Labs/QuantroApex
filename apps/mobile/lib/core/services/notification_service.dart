import 'package:firebase_messaging/firebase_messaging.dart';
import 'api_service.dart';
import 'auth_service.dart';

class NotificationPreferencesData {
  final bool tradeAlerts;
  final bool riskAlerts;
  final String digestFrequency;
  final bool advisorySignals;

  NotificationPreferencesData({
    required this.tradeAlerts,
    required this.riskAlerts,
    required this.digestFrequency,
    required this.advisorySignals,
  });

  factory NotificationPreferencesData.fromJson(Map<String, dynamic> json) {
    return NotificationPreferencesData(
      tradeAlerts: (json['tradeAlerts'] as bool?) ?? true,
      riskAlerts: (json['riskAlerts'] as bool?) ?? true,
      digestFrequency: (json['digestFrequency'] as String?) ?? 'DAILY',
      advisorySignals: (json['advisorySignals'] as bool?) ?? true,
    );
  }
}

class AdvisorySignalData {
  final String id;
  final String symbol;
  final String side;
  final double quantity;
  final double estimatedPrice;
  final double confidence;
  final String reasoning;
  final DateTime createdAt;

  AdvisorySignalData({
    required this.id,
    required this.symbol,
    required this.side,
    required this.quantity,
    required this.estimatedPrice,
    required this.confidence,
    required this.reasoning,
    required this.createdAt,
  });

  factory AdvisorySignalData.fromJson(Map<String, dynamic> json) {
    return AdvisorySignalData(
      id: json['id'] as String,
      symbol: json['symbol'] as String,
      side: json['side'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      estimatedPrice: (json['estimatedPrice'] as num).toDouble(),
      confidence: (json['confidence'] as num).toDouble(),
      reasoning: json['reasoning'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

/// Top-level background message handler — must be a free function (not a closure).
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  // Firebase is already initialized by the time this runs.
  // Logging is the only safe operation here; no UI access.
}

class NotificationService {
  final ApiService _apiService;
  final AuthService _authService;

  NotificationService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  /// Call once after Firebase.initializeApp() in main().
  /// Requests permission, gets the device FCM token, registers it with the
  /// server, and wires foreground + background message handlers.
  Future<void> initializePushNotifications() async {
    final messaging = FirebaseMessaging.instance;

    // Register background handler before requesting permission.
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);

    // Request permission (iOS / macOS prompt; Android 13+ prompt).
    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) return;

    // Fetch and register FCM token.
    final token = await messaging.getToken();
    if (token != null) {
      await registerFcmToken(token);
    }

    // Refresh token whenever FCM rotates it.
    messaging.onTokenRefresh.listen((newToken) async {
      await registerFcmToken(newToken);
    });

    // Foreground messages: show an in-app banner (or delegate to NotificationProvider).
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      // Handled by NotificationProvider listener — see onMessageStream getter.
    });
  }

  /// Expose the foreground message stream so NotificationProvider can subscribe.
  Stream<RemoteMessage> get onMessageStream => FirebaseMessaging.onMessage;

  /// Message that opened the app from background/terminated state.
  Future<RemoteMessage?> getInitialMessage() =>
      FirebaseMessaging.instance.getInitialMessage();

  /// Stream for messages that brought the app to the foreground.
  Stream<RemoteMessage> get onMessageOpenedApp =>
      FirebaseMessaging.onMessageOpenedApp;

  Future<void> registerFcmToken(String fcmToken) async {
    try {
      final token = await _authService.getAccessToken();
      await _apiService.post(
        '/notifications/fcm-token',
        token: token,
        body: {'fcmToken': fcmToken},
      );
    } catch (_) {
      // Token registration is best-effort; do not crash the app.
    }
  }

  Future<NotificationPreferencesData> getPreferences() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/notifications/preferences', token: token);
    final json = (response as Map<String, dynamic>)['preferences'] as Map<String, dynamic>;
    return NotificationPreferencesData.fromJson(json);
  }

  Future<NotificationPreferencesData> updatePreferences({
    bool? tradeAlerts,
    bool? riskAlerts,
    String? digestFrequency,
    bool? advisorySignals,
  }) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.put(
      '/notifications/preferences',
      token: token,
      body: {
        if (tradeAlerts != null) 'tradeAlerts': tradeAlerts,
        if (riskAlerts != null) 'riskAlerts': riskAlerts,
        if (digestFrequency != null) 'digestFrequency': digestFrequency,
        if (advisorySignals != null) 'advisorySignals': advisorySignals,
      },
    );
    final json = (response as Map<String, dynamic>)['preferences'] as Map<String, dynamic>;
    return NotificationPreferencesData.fromJson(json);
  }

  Future<List<AdvisorySignalData>> getAdvisoryFeed() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/notifications/advisory-feed', token: token);
    final list = (response as Map<String, dynamic>)['signals'] as List<dynamic>;
    return list.map((json) => AdvisorySignalData.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<void> respondToAdvisorySignal({
    required String signalId,
    required String action,
    String? symbol,
    String? side,
    double? quantity,
  }) async {
    final token = await _authService.getAccessToken();
    await _apiService.post(
      '/notifications/advisory/respond',
      token: token,
      body: {
        'signalId': signalId,
        'action': action,
        if (symbol != null) 'symbol': symbol,
        if (side != null) 'side': side,
        if (quantity != null) 'quantity': quantity,
      },
    );
  }
}
