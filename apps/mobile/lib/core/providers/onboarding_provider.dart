import 'package:flutter/foundation.dart';
import '../services/onboarding_service.dart';

class OnboardingProvider extends ChangeNotifier {
  final OnboardingService _service;

  String _path = 'NEWCOMER';
  int _currentStep = 1;

  // Onboarding parameters
  bool _globalBrainConsent = false;
  double _dailyLossLimit = 500.0;
  double _maxDrawdown = 0.15;
  double _perTradeExposure = 0.05;
  bool _cryptoEnabled = false;
  bool _stocksEnabled = true;
  bool _forexEnabled = false;

  final Map<String, dynamic> _quizAnswers = {};
  String? _selectedStrategyId;
  double _tradingCapital = 10000.0;
  String _preferredMode = 'SIM';

  String _digestInterval = 'daily';
  bool _milestoneAlerts = true;
  double? _lossThresholdPct = 5.0;
  bool _lossAlertsEnabled = true;

  bool _isSubmitting = false;
  String? _errorMessage;

  OnboardingProvider({OnboardingService? service})
      : _service = service ?? OnboardingService();

  // Getters
  String get path => _path;
  int get currentStep => _currentStep;
  int get totalSteps => _path == 'EXPRESS' ? 4 : 9;

  bool get globalBrainConsent => _globalBrainConsent;
  double get dailyLossLimit => _dailyLossLimit;
  double get maxDrawdown => _maxDrawdown;
  double get perTradeExposure => _perTradeExposure;
  bool get cryptoEnabled => _cryptoEnabled;
  bool get stocksEnabled => _stocksEnabled;
  bool get forexEnabled => _forexEnabled;

  Map<String, dynamic> get quizAnswers => _quizAnswers;
  String? get selectedStrategyId => _selectedStrategyId;
  double get tradingCapital => _tradingCapital;
  String get preferredMode => _preferredMode;

  String get digestInterval => _digestInterval;
  bool get milestoneAlerts => _milestoneAlerts;
  double? get lossThresholdPct => _lossThresholdPct;
  bool get lossAlertsEnabled => _lossAlertsEnabled;

  bool get isSubmitting => _isSubmitting;
  String? get errorMessage => _errorMessage;

  void selectPath(String path) {
    _path = path;
    _currentStep = 1;
    notifyListeners();
    _service.setPath(
      path: path,
      experienceLevel: path == 'EXPRESS' ? 'PROFESSIONAL' : 'NEWCOMER',
    );
  }

  void nextStep() {
    if (_currentStep < totalSteps) {
      _currentStep++;
      notifyListeners();
      _service.saveStep(currentStep: _currentStep);
    }
  }

  void previousStep() {
    if (_currentStep > 1) {
      _currentStep--;
      notifyListeners();
      _service.saveStep(currentStep: _currentStep);
    }
  }

  void setGlobalBrainConsent(bool consent) {
    _globalBrainConsent = consent;
    notifyListeners();
  }

  void setRiskVault({
    double? dailyLossLimit,
    double? maxDrawdown,
    double? perTradeExposure,
    bool? cryptoEnabled,
    bool? stocksEnabled,
    bool? forexEnabled,
  }) {
    if (dailyLossLimit != null) _dailyLossLimit = dailyLossLimit;
    if (maxDrawdown != null) _maxDrawdown = maxDrawdown;
    if (perTradeExposure != null) _perTradeExposure = perTradeExposure;
    if (cryptoEnabled != null) _cryptoEnabled = cryptoEnabled;
    if (stocksEnabled != null) _stocksEnabled = stocksEnabled;
    if (forexEnabled != null) _forexEnabled = forexEnabled;
    notifyListeners();
  }

  void setQuizAnswer(String key, dynamic value) {
    _quizAnswers[key] = value;
    notifyListeners();
  }

  void selectStrategy(String strategyId) {
    _selectedStrategyId = strategyId;
    notifyListeners();
  }

  void setCapital(double amount, {String mode = 'SIM'}) {
    _tradingCapital = amount;
    _preferredMode = mode;
    notifyListeners();
  }

  void setNotificationPrefs({
    String? digestInterval,
    bool? milestoneAlerts,
    double? lossThresholdPct,
    bool? lossAlertsEnabled,
  }) {
    if (digestInterval != null) _digestInterval = digestInterval;
    if (milestoneAlerts != null) _milestoneAlerts = milestoneAlerts;
    if (lossThresholdPct != null) _lossThresholdPct = lossThresholdPct;
    if (lossAlertsEnabled != null) _lossAlertsEnabled = lossAlertsEnabled;
    notifyListeners();
  }

  Future<bool> submitCompletion() async {
    _isSubmitting = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _service.completeOnboarding(
        experienceLevel: _path == 'EXPRESS' ? 'PROFESSIONAL' : 'NEWCOMER',
        globalBrainConsent: _globalBrainConsent,
        riskProfile: _quizAnswers,
        tradingCapital: _tradingCapital,
        preferredTradingMode: _preferredMode,
        strategyId: _selectedStrategyId,
        dailyLossLimit: _dailyLossLimit,
        maxDrawdown: _maxDrawdown,
        perTradeExposure: _perTradeExposure,
        cryptoEnabled: _cryptoEnabled,
        stocksEnabled: _stocksEnabled,
        forexEnabled: _forexEnabled,
        digestInterval: _digestInterval,
        milestoneAlerts: _milestoneAlerts,
        lossThresholdPct: _lossThresholdPct,
        lossAlertsEnabled: _lossAlertsEnabled,
        pushEnabled: true,
      );
      _isSubmitting = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isSubmitting = false;
      _errorMessage = 'Failed to submit onboarding data. Please try again.';
      notifyListeners();
      return false;
    }
  }
}
