import 'package:flutter/foundation.dart';
import '../services/subscription_service.dart';

class PlanDefinition {
  final String id;
  final String name;
  final String priceLabel;
  final List<String> features;
  final bool isFree;

  const PlanDefinition({
    required this.id,
    required this.name,
    required this.priceLabel,
    required this.features,
    this.isFree = false,
  });
}

const kPlanCatalog = <PlanDefinition>[
  PlanDefinition(
    id: 'FREE',
    name: 'Observer',
    priceLabel: 'Free',
    isFree: true,
    features: [
      'Simulation trading',
      'Advisory signals',
      'Strategy marketplace browse',
    ],
  ),
  PlanDefinition(
    id: 'CORE',
    name: 'Core',
    priceLabel: '₦29,000 / mo',
    features: [
      'Everything in Observer',
      'Autopilot execution',
      'Risk Vault enforcement',
      'Push notifications',
    ],
  ),
  PlanDefinition(
    id: 'PRO',
    name: 'Pro',
    priceLabel: '₦79,000 / mo',
    features: [
      'Everything in Core',
      'Manual trading desk',
      'SMC analysis tools',
      'Priority support',
    ],
  ),
  PlanDefinition(
    id: 'ELITE',
    name: 'Elite',
    priceLabel: '₦199,000 / mo',
    features: [
      'Everything in Pro',
      'Unlimited capital allocation',
      'Early Global Brain access',
      'Dedicated onboarding',
    ],
  ),
];

class SubscriptionProvider extends ChangeNotifier {
  final SubscriptionService _service;

  SubscriptionInfo? _current;
  bool _loading = false;
  bool _busy = false;
  String? _error;

  SubscriptionProvider({SubscriptionService? service})
      : _service = service ?? SubscriptionService();

  SubscriptionInfo? get current => _current;
  bool get loading => _loading;
  bool get busy => _busy;
  String? get error => _error;
  String get planId => _current?.plan ?? 'FREE';

  Future<void> refresh() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _current = await _service.getCurrent();
    } catch (e) {
      _error = 'Could not load subscription.';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<CheckoutSession?> startCheckout(String plan) async {
    if (plan == 'FREE') return null;
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final session = await _service.initialise(
        plan: plan,
        callbackUrl: 'https://apex.quantrolabs.app/billing/callback',
      );
      _busy = false;
      notifyListeners();
      return session;
    } catch (e) {
      _error = 'Could not start checkout. Please try again.';
      _busy = false;
      notifyListeners();
      return null;
    }
  }

  Future<bool> confirmPayment({
    required String reference,
    required String plan,
  }) async {
    _busy = true;
    notifyListeners();
    try {
      _current = await _service.verify(reference: reference, plan: plan);
      _busy = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Payment could not be confirmed yet.';
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> cancel() async {
    _busy = true;
    notifyListeners();
    try {
      _current = await _service.cancel();
      _busy = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Could not cancel subscription.';
      _busy = false;
      notifyListeners();
      return false;
    }
  }
}
