import 'dart:convert';
import 'package:http/http.dart' as http;

/// PostHog product analytics for Flutter.
/// Enable with `--dart-define=POSTHOG_API_KEY=phc_...`
class ProductAnalyticsService {
  static const _apiKey = String.fromEnvironment('POSTHOG_API_KEY');
  static const _host = String.fromEnvironment(
    'POSTHOG_HOST',
    defaultValue: 'https://us.i.posthog.com',
  );

  static String? _distinctId;

  static bool get enabled => _apiKey.isNotEmpty;

  static void identify(String distinctId, [Map<String, Object?> properties = const {}]) {
    _distinctId = distinctId;
    if (!enabled) return;
    capture('\$identify', {'\$set': properties});
  }

  static void capture(String event, [Map<String, Object?> properties = const {}]) {
    if (!enabled || _distinctId == null) return;
    // ignore: discarded_futures
    http
        .post(
          Uri.parse('$_host/capture/'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'api_key': _apiKey,
            'event': event,
            'distinct_id': _distinctId,
            'properties': properties,
          }),
        )
        .ignore();
  }

  static void reset() {
    _distinctId = null;
  }
}

extension _IgnoreFuture on Future<Object?> {
  void ignore() {}
}
