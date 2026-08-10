import 'dart:convert';
import 'dart:io';
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
  /// The base URL for the API.
  /// Override via --dart-define=API_BASE_URL=https://api.example.com at build time.
  /// Defaults to Android emulator localhost. For iOS simulator use http://localhost:3000.
  static const String _defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000', // Android emulator → host machine localhost
  );

  static const Duration _requestTimeout = Duration(seconds: 15);

  final String baseUrl;
  final http.Client _client;

  ApiService({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        baseUrl = baseUrl ?? _defaultBaseUrl;

  Map<String, String> _buildHeaders([String? token]) {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
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

  Future<dynamic> get(String path, {String? token}) async {
    try {
      final response = await _client
          .get(
            Uri.parse('$baseUrl$path'),
            headers: _buildHeaders(token),
          )
          .timeout(_requestTimeout);
      return _processResponse(response);
    } on ApiException {
      rethrow;
    } on SocketException {
      throw ApiException(
        statusCode: 0,
        message: 'No internet connection. Please check your network.',
      );
    } catch (_) {
      throw ApiException(
        statusCode: 408,
        message: 'Request timed out. Please check your connection and retry.',
      );
    }
  }

  Future<dynamic> post(String path, {dynamic body, String? token}) async {
    try {
      final response = await _client
          .post(
            Uri.parse('$baseUrl$path'),
            headers: _buildHeaders(token),
            body: body != null ? jsonEncode(body) : null,
          )
          .timeout(_requestTimeout);
      return _processResponse(response);
    } on ApiException {
      rethrow;
    } on SocketException {
      throw ApiException(
        statusCode: 0,
        message: 'No internet connection. Please check your network.',
      );
    } catch (_) {
      throw ApiException(
        statusCode: 408,
        message: 'Request timed out. Please check your connection and retry.',
      );
    }
  }

  Future<dynamic> put(String path, {dynamic body, String? token}) async {
    try {
      final response = await _client
          .put(
            Uri.parse('$baseUrl$path'),
            headers: _buildHeaders(token),
            body: body != null ? jsonEncode(body) : null,
          )
          .timeout(_requestTimeout);
      return _processResponse(response);
    } on ApiException {
      rethrow;
    } on SocketException {
      throw ApiException(
        statusCode: 0,
        message: 'No internet connection. Please check your network.',
      );
    } catch (_) {
      throw ApiException(
        statusCode: 408,
        message: 'Request timed out. Please check your connection and retry.',
      );
    }
  }
}
