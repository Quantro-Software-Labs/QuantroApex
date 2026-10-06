import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/product_analytics_service.dart';

enum AuthStatus {
  initial,
  authenticating,
  authenticated,
  unauthenticated,
}

class AuthProvider extends ChangeNotifier {
  final AuthService _authService;
  StreamSubscription<User?>? _authSub;
  Future<void>? _syncInFlight;

  AuthStatus _status = AuthStatus.initial;
  UserProfile? _user;
  String? _errorMessage;
  String? _phoneVerificationId;
  int? _phoneResendToken;

  AuthProvider({AuthService? authService})
      : _authService = authService ?? AuthService() {
    _listenToAuthChanges();
    // Resolve cold-start session without blocking interactive logins later.
    Future.microtask(checkAuthStatus);
  }

  AuthStatus get status => _status;
  UserProfile? get user => _user;
  String? get errorMessage => _errorMessage;
  bool get isAuthenticated => _status == AuthStatus.authenticated;
  bool get isLoading => _status == AuthStatus.authenticating;
  String? get phoneVerificationId => _phoneVerificationId;

  void _setStatus(AuthStatus status, {String? error}) {
    _status = status;
    _errorMessage = error;
    notifyListeners();
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  void _listenToAuthChanges() {
    _authSub?.cancel();
    _authSub = _authService.authStateChanges.listen((firebaseUser) async {
      if (firebaseUser == null) {
        _user = null;
        if (_status != AuthStatus.authenticating) {
          _setStatus(AuthStatus.unauthenticated);
        }
        return;
      }
      // Interactive sign-in methods also call sync — share one in-flight request.
      if (_status == AuthStatus.authenticating) return;
      await syncProfileFromFirebase();
    });
  }

  Future<void> checkAuthStatus() async {
    _setStatus(AuthStatus.authenticating);
    try {
      if (_authService.currentFirebaseUser == null) {
        _user = null;
        _setStatus(AuthStatus.unauthenticated);
        return;
      }
      final userProfile = await _authService.getCurrentUser();
      if (userProfile != null) {
        _user = userProfile;
        ProductAnalyticsService.identify(userProfile.id, {
          'email': userProfile.email,
          'experience_level': userProfile.experienceLevel,
        });
        _setStatus(AuthStatus.authenticated);
      } else {
        _user = null;
        _setStatus(AuthStatus.unauthenticated);
      }
    } catch (_) {
      _user = null;
      _setStatus(AuthStatus.unauthenticated);
    }
  }

  /// Sync app profile via GET /auth/me using the current Firebase ID token.
  Future<void> syncProfileFromFirebase() {
    return _syncInFlight ??= _syncProfileFromFirebaseImpl().whenComplete(() {
      _syncInFlight = null;
    });
  }

  Future<void> _syncProfileFromFirebaseImpl() async {
    _setStatus(AuthStatus.authenticating);
    try {
      final profile = await _authService.syncProfile();
      _user = profile;
      ProductAnalyticsService.identify(profile.id, {
        'email': profile.email,
        'experience_level': profile.experienceLevel,
      });
      ProductAnalyticsService.capture('user_signed_in');
      _setStatus(AuthStatus.authenticated);
    } on ApiException catch (e) {
      _setStatus(AuthStatus.unauthenticated, error: e.message);
    } catch (_) {
      _setStatus(
        AuthStatus.unauthenticated,
        error: 'Failed to sync session with QuantroApex.',
      );
    }
  }

  Future<bool> login({required String email, required String password}) async {
    return signInWithEmail(email: email, password: password);
  }

  Future<bool> register({
    required String email,
    required String password,
    String? firstName,
    String? lastName,
  }) async {
    final ok = await signInWithEmail(email: email, password: password);
    if (ok && (firstName != null || lastName != null)) {
      await updateProfile(firstName: firstName, lastName: lastName);
    }
    return ok;
  }

  Future<bool> signInWithEmail({
    required String email,
    required String password,
  }) async {
    clearError();
    _setStatus(AuthStatus.authenticating);
    try {
      await _authService.signInWithEmail(email: email, password: password);
      await syncProfileFromFirebase();
      return _status == AuthStatus.authenticated;
    } on FirebaseAuthException catch (e) {
      final msg = switch (e.code) {
        'operation-not-allowed' =>
          'Email/password is disabled in Firebase Console → Authentication → Sign-in method.',
        'wrong-password' || 'invalid-credential' =>
          'Wrong email or password.',
        'too-many-requests' =>
          'Too many attempts. Wait a moment and try again.',
        _ => e.message ?? e.code,
      };
      _setStatus(AuthStatus.unauthenticated, error: msg);
      return false;
    } on ApiException catch (e) {
      _setStatus(AuthStatus.unauthenticated, error: e.message);
      return false;
    } catch (e) {
      _setStatus(
        AuthStatus.unauthenticated,
        error: 'Email sign-in failed: $e',
      );
      return false;
    }
  }

  Future<bool> signInWithGoogle() async {
    _setStatus(AuthStatus.authenticating);
    try {
      await _authService.signInWithGoogle();
      await syncProfileFromFirebase();
      return _status == AuthStatus.authenticated;
    } on ApiException catch (e) {
      _setStatus(AuthStatus.unauthenticated, error: e.message);
      return false;
    } on FirebaseAuthException catch (e) {
      _setStatus(AuthStatus.unauthenticated, error: e.message ?? e.code);
      return false;
    } catch (e) {
      final raw = e.toString();
      final hint = raw.contains('ApiException: 10') ||
              raw.contains('DEVELOPER_ERROR') ||
              raw.contains('sign_in_failed')
          ? 'Google sign-in failed. Add this app’s SHA-1 in Firebase, enable Google provider, then re-download google-services.json.'
          : (raw.length > 160 ? 'Google sign-in failed.' : 'Google sign-in failed: $raw');
      _setStatus(AuthStatus.unauthenticated, error: hint);
      return false;
    }
  }

  Future<bool> startPhoneVerification(String phoneNumber) async {
    clearError();
    final completer = Completer<bool>();

    await _authService.verifyPhoneNumber(
      phoneNumber: phoneNumber,
      forceResendingToken: _phoneResendToken,
      codeSent: (verificationId, resendToken) {
        _phoneVerificationId = verificationId;
        _phoneResendToken = resendToken;
        notifyListeners();
        if (!completer.isCompleted) completer.complete(true);
      },
      verificationFailed: (error) {
        final msg = error.message ?? error.code;
        final lower = msg.toLowerCase();
        if (lower.contains('disabled') ||
            lower.contains('not allowed') ||
            lower.contains('region')) {
          _errorMessage =
              'Phone auth isn’t fully enabled in Firebase. Enable Phone provider and allow SMS for Nigeria (+234) in Firebase Console → Authentication → Sign-in method.';
        } else {
          _errorMessage = msg;
        }
        notifyListeners();
        if (!completer.isCompleted) completer.complete(false);
      },
      verificationCompleted: (credential) async {
        try {
          await _authService.signInWithCredential(credential);
          await syncProfileFromFirebase();
          if (!completer.isCompleted) {
            completer.complete(_status == AuthStatus.authenticated);
          }
        } catch (_) {
          if (!completer.isCompleted) completer.complete(false);
        }
      },
      codeAutoRetrievalTimeout: (verificationId) {
        _phoneVerificationId = verificationId;
      },
    );

    return completer.future.timeout(
      const Duration(seconds: 90),
      onTimeout: () {
        _errorMessage = 'Phone verification timed out. Please try again.';
        notifyListeners();
        return false;
      },
    );
  }

  Future<bool> verifyPhoneOtp(String smsCode) async {
    final verificationId = _phoneVerificationId;
    if (verificationId == null) {
      _setStatus(AuthStatus.unauthenticated, error: 'Start phone verification first.');
      return false;
    }
    _setStatus(AuthStatus.authenticating);
    try {
      await _authService.signInWithPhoneCredential(
        verificationId: verificationId,
        smsCode: smsCode,
      );
      await syncProfileFromFirebase();
      return _status == AuthStatus.authenticated;
    } on FirebaseAuthException catch (e) {
      _setStatus(AuthStatus.unauthenticated, error: e.message ?? e.code);
      return false;
    } catch (_) {
      _setStatus(AuthStatus.unauthenticated, error: 'Invalid verification code.');
      return false;
    }
  }

  Future<Map<String, dynamic>?> joinWaitlist(String assetClass) async {
    try {
      return await _authService.joinWaitlist(assetClass);
    } catch (_) {
      return null;
    }
  }

  Future<void> forgotPassword(String email) async {
    clearError();
    try {
      await _authService.sendPasswordResetEmail(email);
    } on FirebaseAuthException catch (e) {
      _errorMessage = e.message ?? e.code;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> logout() async {
    _setStatus(AuthStatus.authenticating);
    await _authService.logout();
    ProductAnalyticsService.reset();
    _user = null;
    _phoneVerificationId = null;
    _phoneResendToken = null;
    _setStatus(AuthStatus.unauthenticated);
  }

  Future<bool> updateProfile({
    String? firstName,
    String? lastName,
    String? experienceLevel,
    bool? globalBrainConsent,
  }) async {
    try {
      final updatedUser = await _authService.updateProfile(
        firstName: firstName,
        lastName: lastName,
        experienceLevel: experienceLevel,
        globalBrainConsent: globalBrainConsent,
      );
      _user = updatedUser;
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }
}
