import 'package:flutter/foundation.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';

enum AuthStatus {
  initial,
  authenticating,
  authenticated,
  unauthenticated,
}

class AuthProvider extends ChangeNotifier {
  final AuthService _authService;

  AuthStatus _status = AuthStatus.initial;
  UserProfile? _user;
  String? _errorMessage;

  AuthProvider({AuthService? authService})
      : _authService = authService ?? AuthService() {
    checkAuthStatus();
  }

  AuthStatus get status => _status;
  UserProfile? get user => _user;
  String? get errorMessage => _errorMessage;
  bool get isAuthenticated => _status == AuthStatus.authenticated;
  bool get isLoading => _status == AuthStatus.authenticating;

  void _setStatus(AuthStatus status, {String? error}) {
    _status = status;
    _errorMessage = error;
    notifyListeners();
  }

  Future<void> checkAuthStatus() async {
    _setStatus(AuthStatus.authenticating);
    try {
      final userProfile = await _authService.getCurrentUser();
      if (userProfile != null) {
        _user = userProfile;
        _setStatus(AuthStatus.authenticated);
      } else {
        _user = null;
        _setStatus(AuthStatus.unauthenticated);
      }
    } catch (e) {
      _user = null;
      _setStatus(AuthStatus.unauthenticated);
    }
  }

  Future<bool> login({
    required String email,
    required String password,
  }) async {
    _setStatus(AuthStatus.authenticating);
    try {
      final res = await _authService.login(email: email, password: password);
      _user = res.user;
      _setStatus(AuthStatus.authenticated);
      return true;
    } on ApiException catch (e) {
      _setStatus(AuthStatus.unauthenticated, error: e.message);
      return false;
    } catch (e) {
      _setStatus(AuthStatus.unauthenticated, error: 'An unexpected error occurred.');
      return false;
    }
  }

  Future<bool> register({
    required String email,
    required String password,
    String? firstName,
    String? lastName,
  }) async {
    _setStatus(AuthStatus.authenticating);
    try {
      final res = await _authService.register(
        email: email,
        password: password,
        firstName: firstName,
        lastName: lastName,
      );
      _user = res.user;
      _setStatus(AuthStatus.authenticated);
      return true;
    } on ApiException catch (e) {
      _setStatus(AuthStatus.unauthenticated, error: e.message);
      return false;
    } catch (e) {
      _setStatus(AuthStatus.unauthenticated, error: 'An unexpected error occurred.');
      return false;
    }
  }

  Future<void> logout() async {
    _setStatus(AuthStatus.authenticating);
    await _authService.logout();
    _user = null;
    _setStatus(AuthStatus.unauthenticated);
  }
}
