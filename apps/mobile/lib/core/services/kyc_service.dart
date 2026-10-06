import 'api_service.dart';
import 'auth_service.dart';

class KycSession {
  final String accessToken;
  final String applicantId;
  final String level;
  final bool sandbox;

  const KycSession({
    required this.accessToken,
    required this.applicantId,
    required this.level,
    required this.sandbox,
  });

  factory KycSession.fromJson(Map<String, dynamic> json) {
    return KycSession(
      accessToken: json['accessToken'] as String? ?? '',
      applicantId: json['applicantId'] as String? ?? '',
      level: json['level'] as String? ?? 'basic-kyc-level',
      sandbox: json['sandbox'] as bool? ?? false,
    );
  }

  /// Sumsub mobile WebSDK entry — token-gated.
  Uri get webSdkUri => Uri.parse(
        'https://in.sumsub.com/websdk/p/sumsub-msdk.html',
      ).replace(queryParameters: {'accessToken': accessToken});
}

class KycStatus {
  final String status;
  final String? rejectionReason;
  final DateTime? verifiedAt;

  const KycStatus({
    required this.status,
    this.rejectionReason,
    this.verifiedAt,
  });

  bool get isVerified => status == 'VERIFIED';
  bool get isRejected => status == 'REJECTED';
  bool get isUnderReview => status == 'UNDER_REVIEW' || status == 'SUBMITTED';
  bool get isPending => status == 'PENDING';

  factory KycStatus.fromJson(Map<String, dynamic> json) {
    return KycStatus(
      status: (json['status'] as String?) ?? 'PENDING',
      rejectionReason: json['rejectionReason'] as String?,
      verifiedAt: json['verifiedAt'] != null
          ? DateTime.tryParse(json['verifiedAt'] as String)
          : null,
    );
  }
}

class KycService {
  final ApiService _apiService;
  final AuthService _authService;

  KycService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<KycSession> initiate() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.post('/kyc/initiate', token: token);
    return KycSession.fromJson(response as Map<String, dynamic>);
  }

  Future<KycStatus> getStatus() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/kyc/status', token: token);
    return KycStatus.fromJson(response as Map<String, dynamic>);
  }

  Future<KycStatus> sandboxComplete({String result = 'VERIFIED'}) async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.post(
      '/kyc/sandbox-complete',
      token: token,
      body: {'result': result},
    );
    return KycStatus.fromJson(response as Map<String, dynamic>);
  }
}
