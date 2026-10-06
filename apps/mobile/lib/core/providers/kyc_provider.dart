import 'dart:async';
import 'package:flutter/foundation.dart';
import '../services/kyc_service.dart';

enum KycFlowPhase {
  idle,
  initiating,
  webview,
  polling,
  underReview,
  verified,
  rejected,
  error,
}

class KycProvider extends ChangeNotifier {
  final KycService _service;

  KycFlowPhase _phase = KycFlowPhase.idle;
  KycSession? _session;
  KycStatus? _status;
  String? _errorMessage;
  Timer? _pollTimer;
  DateTime? _pollDeadline;

  KycProvider({KycService? service}) : _service = service ?? KycService();

  KycFlowPhase get phase => _phase;
  KycSession? get session => _session;
  KycStatus? get status => _status;
  String? get errorMessage => _errorMessage;
  bool get isVerified => _status?.isVerified ?? false;

  Future<KycStatus?> refreshStatus() async {
    try {
      _status = await _service.getStatus();
      if (_status!.isVerified) {
        _phase = KycFlowPhase.verified;
      } else if (_status!.isRejected) {
        _phase = KycFlowPhase.rejected;
      } else if (_status!.isUnderReview) {
        _phase = KycFlowPhase.underReview;
      }
      notifyListeners();
      return _status;
    } catch (e) {
      _errorMessage = 'Could not load verification status.';
      notifyListeners();
      return null;
    }
  }

  Future<bool> startVerification() async {
    _phase = KycFlowPhase.initiating;
    _errorMessage = null;
    notifyListeners();

    try {
      _session = await _service.initiate();
      _status = await _service.getStatus();
      _phase = KycFlowPhase.webview;
      notifyListeners();
      _startPolling();
      return true;
    } catch (e) {
      _phase = KycFlowPhase.error;
      _errorMessage = 'Could not start identity verification. Please try again.';
      notifyListeners();
      return false;
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollDeadline = DateTime.now().add(const Duration(minutes: 2));
    _phase = KycFlowPhase.polling;
    notifyListeners();

    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      if (_pollDeadline != null && DateTime.now().isAfter(_pollDeadline!)) {
        // After 2 minutes of active polling, settle into under-review wait.
        _pollTimer?.cancel();
        final current = await _service.getStatus();
        _status = current;
        if (current.isVerified) {
          _phase = KycFlowPhase.verified;
        } else if (current.isRejected) {
          _phase = KycFlowPhase.rejected;
        } else {
          _phase = KycFlowPhase.underReview;
        }
        notifyListeners();
        return;
      }

      try {
        final current = await _service.getStatus();
        _status = current;
        if (current.isVerified) {
          _pollTimer?.cancel();
          _phase = KycFlowPhase.verified;
        } else if (current.isRejected) {
          _pollTimer?.cancel();
          _phase = KycFlowPhase.rejected;
        }
        notifyListeners();
      } catch (_) {
        // Keep polling through transient network blips.
      }
    });
  }

  Future<void> completeSandbox({required bool approved}) async {
    try {
      _status = await _service.sandboxComplete(
        result: approved ? 'VERIFIED' : 'REJECTED',
      );
      _pollTimer?.cancel();
      _phase = approved ? KycFlowPhase.verified : KycFlowPhase.rejected;
      notifyListeners();
    } catch (e) {
      _errorMessage = 'Sandbox verification failed.';
      notifyListeners();
    }
  }

  Future<void> retry() async {
    _pollTimer?.cancel();
    _session = null;
    _errorMessage = null;
    await startVerification();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }
}
