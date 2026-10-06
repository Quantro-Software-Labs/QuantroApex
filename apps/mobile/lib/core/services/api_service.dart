import 'dart:async';
import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final int statusCode;
  final String message;
  final dynamic details;

  ApiException({
    required this.statusCode,
    required this.message,
    this.details,
  });

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiService {
  /// Computes the optimal default base URL based on runtime platform:
  /// - Environment variable `--dart-define=API_BASE_URL=<url>` (if provided)
  /// - Web & Desktop & iOS Simulator: http://localhost:3000
  /// - Android Emulator: http://10.0.2.2:3000
  static String get _computedDefaultBaseUrl {
    const fromEnv = String.fromEnvironment('API_BASE_URL');
    if (fromEnv.isNotEmpty) return fromEnv;

    if (kIsWeb) {
      return 'http://localhost:3000';
    }

    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }

    return 'http://localhost:3000';
  }

  static const Duration _requestTimeout = Duration(seconds: 15);

  final String baseUrl;
  final http.Client _client;

  ApiService({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        baseUrl = baseUrl ?? _computedDefaultBaseUrl;

  Future<String?> _resolveToken(String? token) async {
    if (token != null && token.isNotEmpty) return token;
    return FirebaseAuth.instance.currentUser?.getIdToken();
  }

  Future<Map<String, String>> _buildHeaders([String? token]) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    final resolved = await _resolveToken(token);
    if (resolved != null && resolved.isNotEmpty) {
      headers['Authorization'] = 'Bearer $resolved';
    }
    return headers;
  }

  dynamic _processResponse(http.Response response) {
    dynamic body;
    if (response.body.isNotEmpty) {
      try {
        body = jsonDecode(response.body);
      } catch (_) {
        body = response.body;
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    }

    final message = (body is Map && body.containsKey('message'))
        ? body['message'].toString()
        : 'HTTP Error ${response.statusCode}';
    final details =
        (body is Map && body.containsKey('details')) ? body['details'] : null;

    throw ApiException(
      statusCode: response.statusCode,
      message: message,
      details: details,
    );
  }

  Future<dynamic> _safeExecute(Future<http.Response> Function() action) async {
    try {
      final response = await action().timeout(_requestTimeout);
      return _processResponse(response);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw ApiException(
        statusCode: 408,
        message:
            'Request timed out reaching $baseUrl. Start backends (npm run dev:all) and stay on the same Wi‑Fi.',
      );
    } catch (e) {
      throw ApiException(
        statusCode: 0,
        message:
            'Unable to connect to server at $baseUrl. Please verify API Gateway is running.',
        details: e.toString(),
      );
    }
  }

  Future<dynamic> get(String path, {String? token}) async {
    final headers = await _buildHeaders(token);
    return _safeExecute(
      () => _client.get(
        Uri.parse('$baseUrl$path'),
        headers: headers,
      ),
    );
  }

  Future<dynamic> post(String path, {dynamic body, String? token}) async {
    final headers = await _buildHeaders(token);
    return _safeExecute(
      () => _client.post(
        Uri.parse('$baseUrl$path'),
        headers: headers,
        body: body != null ? jsonEncode(body) : null,
      ),
    );
  }

  Future<dynamic> put(String path, {dynamic body, String? token}) async {
    final headers = await _buildHeaders(token);
    return _safeExecute(
      () => _client.put(
        Uri.parse('$baseUrl$path'),
        headers: headers,
        body: body != null ? jsonEncode(body) : null,
      ),
    );
  }

  Future<dynamic> delete(String path, {String? token}) async {
    final headers = await _buildHeaders(token);
    return _safeExecute(
      () => _client.delete(
        Uri.parse('$baseUrl$path'),
        headers: headers,
      ),
    );
  }
}
