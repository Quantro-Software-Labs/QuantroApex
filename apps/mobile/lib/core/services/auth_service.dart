import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_service.dart';

class UserProfile {
  final String id;
  final String email;
  final String? firstName;
  final String? lastName;
  final String experienceLevel;
  final DateTime? onboardingCompletedAt;

  UserProfile({
    required this.id,
    required this.email,
    this.firstName,
    this.lastName,
    required this.experienceLevel,
    this.onboardingCompletedAt,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id'] as String,
      email: json['email'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      experienceLevel: (json['experienceLevel'] as String?) ?? 'NEWCOMER',
      onboardingCompletedAt: json['onboardingCompletedAt'] != null
          ? DateTime.tryParse(json['onboardingCompletedAt'] as String)
          : null,
    );
  }
}

class AuthResponse {
  final UserProfile user;
  final String accessToken;
  final String refreshToken;

  AuthResponse({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      user: UserProfile.fromJson(json['user'] as Map<String, dynamic>),
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}

class AuthService {
  static const _keyAccessToken = 'access_token';
  static const _keyRefreshToken = 'refresh_token';

  final ApiService _apiService;
  final FlutterSecureStorage _storage;

  AuthService({
    ApiService? apiService,
    FlutterSecureStorage? storage,
  })  : _apiService = apiService ?? ApiService(),
        _storage = storage ?? const FlutterSecureStorage();

  Future<void> _saveTokens(String accessToken, String refreshToken) async {
    await _storage.write(key: _keyAccessToken, value: accessToken);
    await _storage.write(key: _keyRefreshToken, value: refreshToken);
  }

  Future<void> clearTokens() async {
    await _storage.delete(key: _keyAccessToken);
    await _storage.delete(key: _keyRefreshToken);
  }

  Future<String?> getAccessToken() async {
    return await _storage.read(key: _keyAccessToken);
  }

  Future<String?> getRefreshToken() async {
    return await _storage.read(key: _keyRefreshToken);
  }

  Future<AuthResponse> register({
    required String email,
    required String password,
    String? firstName,
    String? lastName,
  }) async {
    final response = await _apiService.post(
      '/auth/register',
      body: {
        'email': email,
        'password': password,
        if (firstName != null && firstName.isNotEmpty) 'firstName': firstName,
        if (lastName != null && lastName.isNotEmpty) 'lastName': lastName,
      },
    );

    final authRes = AuthResponse.fromJson(response as Map<String, dynamic>);
    await _saveTokens(authRes.accessToken, authRes.refreshToken);
    return authRes;
  }

  Future<AuthResponse> login({
    required String email,
    required String password,
  }) async {
    final response = await _apiService.post(
      '/auth/login',
      body: {
        'email': email,
        'password': password,
      },
    );

    final authRes = AuthResponse.fromJson(response as Map<String, dynamic>);
    await _saveTokens(authRes.accessToken, authRes.refreshToken);
    return authRes;
  }

  Future<void> logout() async {
    final token = await getAccessToken();
    if (token != null) {
      try {
        await _apiService.post('/auth/logout', token: token);
      } catch (_) {
        // Ignore network failure on logout
      }
    }
    await clearTokens();
  }

  Future<UserProfile?> getCurrentUser() async {
    final token = await getAccessToken();
    if (token == null) return null;

    try {
      final response = await _apiService.get('/auth/me', token: token);
      return UserProfile.fromJson(response as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        // Try refreshing token once
        final refreshed = await refreshSession();
        if (refreshed) {
          final newToken = await getAccessToken();
          if (newToken != null) {
            final response = await _apiService.get('/auth/me', token: newToken);
            return UserProfile.fromJson(response as Map<String, dynamic>);
          }
        }
      }
      await clearTokens();
      return null;
    } catch (_) {
      await clearTokens();
      return null;
    }
  }

  Future<bool> refreshSession() async {
    final refreshToken = await getRefreshToken();
    if (refreshToken == null) return false;

    try {
      final response = await _apiService.post(
        '/auth/refresh',
        body: {'refreshToken': refreshToken},
      );

      final newAccessToken = response['accessToken'] as String;
      final newRefreshToken = response['refreshToken'] as String;
      await _saveTokens(newAccessToken, newRefreshToken);
      return true;
    } catch (_) {
      await clearTokens();
      return false;
    }
  }
}
