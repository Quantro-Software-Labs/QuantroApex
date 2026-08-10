import 'dart:async';
import 'package:flutter/foundation.dart';
import '../services/activity_feed_service.dart';
import '../services/websocket_service.dart';

class DashboardProvider extends ChangeNotifier {
  final ActivityFeedService _feedService;
  final WebSocketService _wsService;
  StreamSubscription? _wsSubscription;

  List<ActivityEntryData> _entries = [];
  AgentStateData _agentState = AgentStateData(phase: 'SEED', confidenceScore: 0.85, tradeCount: 0);
  String? _activeStrategyName;

  bool _isLoading = false;
  String? _errorMessage;

  DashboardProvider({
    ActivityFeedService? feedService,
    WebSocketService? wsService,
  })  : _feedService = feedService ?? ActivityFeedService(),
        _wsService = wsService ?? WebSocketService() {
    initDashboard();
  }

  List<ActivityEntryData> get entries => _entries;
  AgentStateData get agentState => _agentState;
  String? get activeStrategyName => _activeStrategyName;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  Future<void> initDashboard() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final data = await _feedService.getActivityFeed();
      _entries = data.entries;
      _agentState = data.agentState;
      _activeStrategyName = data.activeStrategyName;

      _subscribeWebSocket();
    } catch (e) {
      _errorMessage = 'Failed to load dashboard.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void _subscribeWebSocket() {
    _wsSubscription?.cancel();
    _wsService.connect();
    _wsSubscription = _wsService.eventStream.listen((event) {
      final type = event['type'] as String?;
      if (type == 'ACTIVITY_LOGGED') {
        final data = event['data'] as Map<String, dynamic>?;
        if (data != null) {
          final newEntry = ActivityEntryData.fromJson(data);
          _entries.insert(0, newEntry);
          notifyListeners();
        }
      }
    });
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    _wsService.disconnect();
    super.dispose();
  }
}
