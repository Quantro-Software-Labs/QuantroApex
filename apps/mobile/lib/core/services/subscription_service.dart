import 'api_service.dart';
import 'auth_service.dart';

class PlanFeatures {
  final bool advisory;
  final bool simulation;
  final bool autopilot;
  final bool manualDesk;
  final bool smcTools;
  final bool unlimitedCapital;

  const PlanFeatures({
    required this.advisory,
    required this.simulation,
    required this.autopilot,
    required this.manualDesk,
    required this.smcTools,
    required this.unlimitedCapital,
  });

  factory PlanFeatures.fromJson(Map<String, dynamic> json) {
    return PlanFeatures(
      advisory: json['advisory'] as bool? ?? true,
      simulation: json['simulation'] as bool? ?? true,
      autopilot: json['autopilot'] as bool? ?? false,
      manualDesk: json['manualDesk'] as bool? ?? false,
      smcTools: json['smcTools'] as bool? ?? false,
      unlimitedCapital: json['unlimitedCapital'] as bool? ?? false,
    );
  }
}

class SubscriptionInfo {
  final String plan;
  final DateTime? activeUntil;
  final DateTime? cancelledAt;
  final PlanFeatures features;

  const SubscriptionInfo({
    required this.plan,
    this.activeUntil,
    this.cancelledAt,
    required this.features,
  });

  bool get isPaid => plan != 'FREE' && plan != 'OBSERVER';
  bool get isCancelled => cancelledAt != null;

  factory SubscriptionInfo.fromJson(Map<String, dynamic> json) {
    return SubscriptionInfo(
      plan: (json['plan'] as String?) ?? 'FREE',
      activeUntil: json['activeUntil'] != null
          ? DateTime.tryParse(json['activeUntil'] as String)
          : null,
      cancelledAt: json['cancelledAt'] != null
          ? DateTime.tryParse(json['cancelledAt'] as String)
          : null,
      features: PlanFeatures.fromJson(
        (json['features'] as Map<String, dynamic>?) ?? {},
      ),
    );
  }
}

class CheckoutSession {
  final String authorizationUrl;
  final String accessCode;
  final String reference;
  final String? publicKey;

  const CheckoutSession({
    required this.authorizationUrl,
    required this.accessCode,
    required this.reference,
    this.publicKey,
  });

  factory CheckoutSession.fromJson(Map<String, dynamic> json) {
    return CheckoutSession(
      authorizationUrl: json['authorizationUrl'] as String? ?? '',
      accessCode: json['accessCode'] as String? ?? '',
      reference: json['reference'] as String? ?? '',
      publicKey: json['publicKey'] as String?,
    );
  }
}

class SubscriptionService {
  final ApiService _apiService;
  final AuthService _authService;

  SubscriptionService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<SubscriptionInfo> getCurrent() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/subscriptions/current', token: token);
    return SubscriptionInfo.fromJson(response as Map<String, dynamic>);
  }

  Future<CheckoutSession> initialise({
    required String plan,
    String? email,
    String? callbackUrl,
  }) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.post(
      '/subscriptions/initialise',
      token: token,
      body: {
        'plan': plan,
        if (email != null) 'email': email,
        if (callbackUrl != null) 'callbackUrl': callbackUrl,
      },
    );
    return CheckoutSession.fromJson(response as Map<String, dynamic>);
  }

  Future<SubscriptionInfo> verify({
    required String reference,
    required String plan,
  }) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.post(
      '/subscriptions/verify',
      token: token,
      body: {'reference': reference, 'plan': plan},
    );
    final sub = (response as Map<String, dynamic>)['subscription'];
    // Re-fetch current for feature flags
    if (sub is Map<String, dynamic>) {
      return getCurrent();
    }
    return getCurrent();
  }

  Future<SubscriptionInfo> cancel() async {
    final token = await _authService.getAccessToken();
    await _apiService.post('/subscriptions/cancel', token: token);
    return getCurrent();
  }
}
