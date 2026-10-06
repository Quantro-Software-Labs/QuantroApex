import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import '../services/notification_service.dart';

/// A lightweight model for an in-app notification banner.
class InAppNotification {
  final String title;
  final String body;
  final String category;
  final DateTime receivedAt;

  InAppNotification({
    required this.title,
    required this.body,
    required this.category,
    required this.receivedAt,
  });

  factory InAppNotification.fromRemoteMessage(RemoteMessage message) {
    return InAppNotification(
      title: message.notification?.title ?? 'Apex',
      body: message.notification?.body ?? '',
      category: (message.data['category'] as String?) ?? 'TRADE',
      receivedAt: DateTime.now(),
    );
  }
}

class NotificationProvider extends ChangeNotifier {
  final NotificationService _service;

  NotificationPreferencesData? _preferences;
  List<AdvisorySignalData> _advisorySignals = [];
  final List<InAppNotification> _inAppQueue = [];

  bool _isLoading = false;
  bool _isUpdating = false;
  String? _errorMessage;

  StreamSubscription<RemoteMessage>? _foregroundSub;

  NotificationProvider({NotificationService? service})
      : _service = service ?? NotificationService() {
    _subscribeForeground();
  }

  NotificationPreferencesData? get preferences => _preferences;
  List<AdvisorySignalData> get advisorySignals => _advisorySignals;
  List<InAppNotification> get inAppQueue => List.unmodifiable(_inAppQueue);
  bool get isLoading => _isLoading;
  bool get isUpdating => _isUpdating;
  String? get errorMessage => _errorMessage;

  void _subscribeForeground() {
    _foregroundSub = _service.onMessageStream.listen((RemoteMessage message) {
      if (message.notification != null) {
        _inAppQueue.insert(0, InAppNotification.fromRemoteMessage(message));
        // Keep at most 20 unread banners in memory.
        if (_inAppQueue.length > 20) _inAppQueue.removeLast();
        notifyListeners();
      }
    });
  }

  void dismissInAppNotification(int index) {
    if (index >= 0 && index < _inAppQueue.length) {
      _inAppQueue.removeAt(index);
      notifyListeners();
    }
  }

  Future<void> loadNotificationState() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        _service.getPreferences(),
        _service.getAdvisoryFeed(),
      ]);

      _preferences = results[0] as NotificationPreferencesData;
      _advisorySignals = results[1] as List<AdvisorySignalData>;
    } catch (e) {
      _errorMessage = 'Failed to load notification settings.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> updatePreferences({
    bool? tradeAlerts,
    bool? riskAlerts,
    String? digestFrequency,
    bool? advisorySignals,
  }) async {
    _isUpdating = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _preferences = await _service.updatePreferences(
        tradeAlerts: tradeAlerts,
        riskAlerts: riskAlerts,
        digestFrequency: digestFrequency,
        advisorySignals: advisorySignals,
      );
    } catch (e) {
      _errorMessage = 'Failed to update preferences.';
    } finally {
      _isUpdating = false;
      notifyListeners();
    }
  }

  Future<bool> respondToSignal({
    required String signalId,
    required String action,
    String? symbol,
    String? side,
    double? quantity,
  }) async {
    try {
      await _service.respondToAdvisorySignal(
        signalId: signalId,
        action: action,
        symbol: symbol,
        side: side,
        quantity: quantity,
      );
      _advisorySignals.removeWhere((s) => s.id == signalId);
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Failed to respond to advisory signal.';
      notifyListeners();
      return false;
    }
  }

  @override
  void dispose() {
    _foregroundSub?.cancel();
    super.dispose();
  }
}
