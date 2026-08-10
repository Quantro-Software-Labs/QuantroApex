import 'package:flutter/foundation.dart';
import '../services/notification_service.dart';

class NotificationProvider extends ChangeNotifier {
  final NotificationService _service;

  NotificationPreferencesData? _preferences;
  List<AdvisorySignalData> _advisorySignals = [];

  bool _isLoading = false;
  bool _isUpdating = false;
  String? _errorMessage;

  NotificationProvider({NotificationService? service})
      : _service = service ?? NotificationService() {
    loadNotificationState();
  }

  NotificationPreferencesData? get preferences => _preferences;
  List<AdvisorySignalData> get advisorySignals => _advisorySignals;
  bool get isLoading => _isLoading;
  bool get isUpdating => _isUpdating;
  String? get errorMessage => _errorMessage;

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
}
