import 'api_service.dart';
import 'auth_service.dart';

class ActivityEntryData {
  final String id;
  final String eventType;
  final String message;
  final DateTime createdAt;

  ActivityEntryData({
    required this.id,
    required this.eventType,
    required this.message,
    required this.createdAt,
  });

  factory ActivityEntryData.fromJson(Map<String, dynamic> json) {
    return ActivityEntryData(
      id: json['id'] as String,
      eventType: json['eventType'] as String,
      message: json['message'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class AgentStateData {
  final String phase;
  final double confidenceScore;
  final int tradeCount;

  AgentStateData({
    required this.phase,
    required this.confidenceScore,
    required this.tradeCount,
  });

  factory AgentStateData.fromJson(Map<String, dynamic> json) {
    return AgentStateData(
      phase: (json['phase'] as String?) ?? 'SEED',
      confidenceScore: (json['confidenceScore'] is num)
          ? (json['confidenceScore'] as num).toDouble()
          : 0.85,
      tradeCount: (json['tradeCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class ActivityFeedResponse {
  final List<ActivityEntryData> entries;
  final AgentStateData agentState;
  final String? activeStrategyName;

  ActivityFeedResponse({
    required this.entries,
    required this.agentState,
    this.activeStrategyName,
  });
}

class ActivityFeedService {
  final ApiService _apiService;
  final AuthService _authService;

  ActivityFeedService({
    ApiService? apiService,
    AuthService? authService,
  })  : _apiService = apiService ?? ApiService(),
        _authService = authService ?? AuthService();

  Future<ActivityFeedResponse> getActivityFeed() async {
    final token = await _authService.getAccessToken();
    final response = await _apiService.get('/activity-feed', token: token);
    final map = response as Map<String, dynamic>;

    final rawEntries = (map['entries'] as List<dynamic>?) ?? [];
    final entries = rawEntries
        .map((e) => ActivityEntryData.fromJson(e as Map<String, dynamic>))
        .toList();

    final agentState = AgentStateData.fromJson(
        (map['agentState'] as Map<String, dynamic>?) ?? {});
    final strategyMap = map['activeStrategy'] as Map<String, dynamic>?;

    return ActivityFeedResponse(
      entries: entries,
      agentState: agentState,
      activeStrategyName: strategyMap != null ? strategyMap['name'] as String? : null,
    );
  }
}
