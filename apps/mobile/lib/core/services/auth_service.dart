import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'api_service.dart';

class UserProfile {
  final String id;
  final String email;
  final String? phone;
  final String? firstName;
  final String? lastName;
  final String experienceLevel;
  final DateTime? onboardingCompletedAt;

  UserProfile({
    required this.id,
    required this.email,
    this.phone,
    this.firstName,
    this.lastName,
    required this.experienceLevel,
    this.onboardingCompletedAt,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    final email = json['email'] as String?;
    final phone = json['phone'] as String?;
    return UserProfile(
      id: json['id'] as String,
      email: email ?? phone ?? '',
      phone: phone,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      experienceLevel: (json['experienceLevel'] as String?) ?? 'NEWCOMER',
      onboardingCompletedAt: json['onboardingCompletedAt'] != null
          ? DateTime.tryParse(json['onboardingCompletedAt'] as String)
          : null,
    );
  }
}

/// Auth is owned by Firebase. This service fetches Firebase ID tokens
/// and syncs / fetches the QuantroApex app profile from the API.
class AuthService {
  final ApiService _apiService;
  final FirebaseAuth? _providedFirebaseAuth;
  final GoogleSignIn _googleSignIn;
  final FlutterSecureStorage _storage;

  AuthService({
    ApiService? apiService,
    FirebaseAuth? firebaseAuth,
    GoogleSignIn? googleSignIn,
    FlutterSecureStorage? storage,
  })  : _apiService = apiService ?? ApiService(),
        _providedFirebaseAuth = firebaseAuth,
        _googleSignIn = googleSignIn ??
            GoogleSignIn(
              scopes: ['email', 'profile'],
              // Web client ID — required for idToken on Android and for web Google Sign-In.
              clientId: kIsWeb
                  ? '429681170519-0ai4ej11rokhgn29ii512m7a7rfkjas3.apps.googleusercontent.com'
                  : null,
              serverClientId:
                  '429681170519-0ai4ej11rokhgn29ii512m7a7rfkjas3.apps.googleusercontent.com',
            ),
        _storage = storage ?? const FlutterSecureStorage();

  FirebaseAuth get _firebaseAuth => _providedFirebaseAuth ?? FirebaseAuth.instance;

  User? get currentFirebaseUser {
    try {
      return _firebaseAuth.currentUser;
    } catch (_) {
      return null;
    }
  }

  Stream<User?> get authStateChanges {
    try {
      return _firebaseAuth.authStateChanges();
    } catch (_) {
      return const Stream.empty();
    }
  }

  /// Returns a fresh Firebase ID token for API Authorization headers.
  Future<String?> getAccessToken({bool forceRefresh = false}) async {
    try {
      final user = _firebaseAuth.currentUser;
      if (user == null) return null;
      return user.getIdToken(forceRefresh);
    } catch (_) {
      return null;
    }
  }

  Future<void> clearLegacyTokens() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'refresh_token');
  }

  Future<void> sendPasswordResetEmail(String email) async {
    await _firebaseAuth.sendPasswordResetEmail(email: email.trim());
  }

  /// Sync profile via GET /auth/me (API upserts user from Firebase token).
  Future<UserProfile> syncProfile() async {
    final token = await getAccessToken();
    if (token == null) {
      throw ApiException(statusCode: 401, message: 'Not signed in');
    }
    final response = await _apiService.get('/auth/me', token: token);
    return UserProfile.fromJson(response as Map<String, dynamic>);
  }

  Future<UserProfile?> getCurrentUser() async {
    if (_firebaseAuth.currentUser == null) return null;
    try {
      return await syncProfile();
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        await logout();
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<UserCredential> signInWithEmail({
    required String email,
    required String password,
  }) async {
    try {
      return await _firebaseAuth.signInWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
    } on FirebaseAuthException catch (e) {
      if (e.code == 'user-not-found' || e.code == 'invalid-credential') {
        try {
          return await _firebaseAuth.createUserWithEmailAndPassword(
            email: email.trim(),
            password: password,
          );
        } on FirebaseAuthException catch (createErr) {
          if (createErr.code == 'email-already-in-use') {
            return await _firebaseAuth.signInWithEmailAndPassword(
              email: email.trim(),
              password: password,
            );
          }
          rethrow;
        }
      }
      rethrow;
    }
  }

  Future<UserCredential> signInWithGoogle() async {
    if (kIsWeb) {
      final googleProvider = GoogleAuthProvider();
      return _firebaseAuth.signInWithPopup(googleProvider);
    }
    final googleUser = await _googleSignIn.signIn();
    if (googleUser == null) {
      throw ApiException(statusCode: 0, message: 'Google sign-in cancelled');
    }
    final googleAuth = await googleUser.authentication;
    if (googleAuth.idToken == null) {
      throw ApiException(
        statusCode: 0,
        message:
            'Google did not return an ID token. Add the SHA-1 fingerprint in Firebase, enable Google sign-in, and ensure the Web client ID is configured.',
      );
    }
    final credential = GoogleAuthProvider.credential(
      accessToken: googleAuth.accessToken,
      idToken: googleAuth.idToken,
    );
    return _firebaseAuth.signInWithCredential(credential);
  }

  Future<void> verifyPhoneNumber({
    required String phoneNumber,
    required void Function(String verificationId, int? resendToken) codeSent,
    required void Function(FirebaseAuthException error) verificationFailed,
    required void Function(PhoneAuthCredential credential) verificationCompleted,
    required void Function(String verificationId) codeAutoRetrievalTimeout,
    int? forceResendingToken,
  }) async {
    await _firebaseAuth.verifyPhoneNumber(
      phoneNumber: phoneNumber,
      timeout: const Duration(seconds: 60),
      forceResendingToken: forceResendingToken,
      verificationCompleted: verificationCompleted,
      verificationFailed: verificationFailed,
      codeSent: codeSent,
      codeAutoRetrievalTimeout: codeAutoRetrievalTimeout,
    );
  }

  Future<UserCredential> signInWithPhoneCredential({
    required String verificationId,
    required String smsCode,
  }) async {
    final credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );
    return _firebaseAuth.signInWithCredential(credential);
  }

  Future<UserCredential> signInWithCredential(AuthCredential credential) {
    return _firebaseAuth.signInWithCredential(credential);
  }

  Future<void> logout() async {
    final token = await getAccessToken();
    if (token != null) {
      try {
        await _apiService.post('/auth/logout', token: token);
      } catch (_) {}
    }
    try {
      await _googleSignIn.signOut();
    } catch (_) {}
    await _firebaseAuth.signOut();
    await clearLegacyTokens();
  }

  Future<UserProfile> updateProfile({
    String? firstName,
    String? lastName,
    String? experienceLevel,
    bool? globalBrainConsent,
  }) async {
    final token = await getAccessToken();
    final response = await _apiService.put(
      '/auth/profile',
      token: token,
      body: {
        if (firstName != null) 'firstName': firstName,
        if (lastName != null) 'lastName': lastName,
        if (experienceLevel != null) 'experienceLevel': experienceLevel,
        if (globalBrainConsent != null) 'globalBrainConsent': globalBrainConsent,
      },
    );
    final userJson = (response as Map<String, dynamic>)['user'] as Map<String, dynamic>;
    return UserProfile.fromJson(userJson);
  }

  Future<Map<String, dynamic>> joinWaitlist(String assetClass) async {
    final token = await getAccessToken();
    final response = await _apiService.post(
      '/waitlist',
      token: token,
      body: {'assetClass': assetClass},
    );
    return response as Map<String, dynamic>;
  }
}
