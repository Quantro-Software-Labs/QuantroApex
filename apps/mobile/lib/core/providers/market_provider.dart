import 'dart:async';
import 'package:flutter/foundation.dart';
import '../services/market_service.dart';

class MarketProvider extends ChangeNotifier {
  final MarketService _service;

  List<StockQuoteData> _stocks = [];
  List<StockQuoteData> _tickerItems = [];
  StockDetailResponse? _selectedStockDetail;
  AiStudyResponse? _aiStudy;
  LearningStatsResponse? _learningStats;
  MarketSentimentData? _sentiment;

  String _selectedAssetClass = 'ALL';
  String _searchQuery = '';
  String _selectedSector = 'ALL';
  bool _isLoading = false;
  bool _isDetailLoading = false;
  bool _isAiStudyLoading = false;
  String? _errorMessage;

  Timer? _refreshTimer;
  bool _autoRefreshEnabled = false;

  MarketProvider({MarketService? service})
      : _service = service ?? MarketService();

  List<StockQuoteData> get stocks => _filteredStocks;
  List<StockQuoteData> get tickerItems => _tickerItems;
  StockDetailResponse? get selectedStockDetail => _selectedStockDetail;
  AiStudyResponse? get aiStudy => _aiStudy;
  LearningStatsResponse? get learningStats => _learningStats;
  MarketSentimentData? get sentiment => _sentiment;

  String get selectedAssetClass => _selectedAssetClass;
  String get searchQuery => _searchQuery;
  String get selectedSector => _selectedSector;
  bool get isLoading => _isLoading;
  bool get isDetailLoading => _isDetailLoading;
  bool get isAiStudyLoading => _isAiStudyLoading;
  String? get errorMessage => _errorMessage;

  List<StockQuoteData> get _filteredStocks {
    return _stocks.where((stock) {
      final matchesSearch = stock.symbol.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          stock.name.toLowerCase().contains(_searchQuery.toLowerCase());
      final matchesSector = _selectedSector == 'ALL' || stock.sector == _selectedSector;
      final matchesAssetClass = _selectedAssetClass == 'ALL' || stock.assetClass == _selectedAssetClass;
      return matchesSearch && matchesSector && matchesAssetClass;
    }).toList();
  }

  List<String> get availableSectors {
    final sectors = <String>{'ALL'};
    for (var stock in _stocks) {
      if (_selectedAssetClass == 'ALL' || stock.assetClass == _selectedAssetClass) {
        sectors.add(stock.sector);
      }
    }
    return sectors.toList();
  }

  void startAutoRefresh({Duration interval = const Duration(seconds: 10)}) {
    if (_autoRefreshEnabled) return;
    _autoRefreshEnabled = true;
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(interval, (_) {
      loadStocks(silent: true);
      loadTicker(silent: true);
      loadSentiment(silent: true);
    });
  }

  void stopAutoRefresh() {
    _autoRefreshEnabled = false;
    _refreshTimer?.cancel();
    _refreshTimer = null;
  }

  Future<void> loadMarketHub({bool silent = false}) async {
    await Future.wait([
      loadStocks(silent: silent),
      loadSentiment(silent: silent),
    ]);
  }

  Future<void> loadStocks({bool silent = false}) async {
    if (!silent) {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();
    }

    try {
      _stocks = await _service.getStocks(
        assetClass: _selectedAssetClass == 'ALL' ? null : _selectedAssetClass,
      );
    } catch (e) {
      if (!silent) _errorMessage = 'Failed to load market quotes.';
    } finally {
      if (!silent) _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadTicker({bool silent = false}) async {
    try {
      _tickerItems = await _service.getTicker();
      if (!silent) notifyListeners();
      else notifyListeners();
    } catch (_) {
      // Keep last ticker data on silent failure
      if (!silent) notifyListeners();
    }
  }

  Future<void> loadSentiment({bool silent = false}) async {
    try {
      _sentiment = await _service.getSentiment();
      if (!silent) notifyListeners();
      else notifyListeners();
    } catch (_) {
      if (!silent) notifyListeners();
    }
  }

  void setSelectedAssetClass(String assetClass) {
    _selectedAssetClass = assetClass;
    _selectedSector = 'ALL';
    loadMarketHub();
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    notifyListeners();
  }

  void setSelectedSector(String sector) {
    _selectedSector = sector;
    notifyListeners();
  }

  Future<void> loadStockDetail(String symbol) async {
    _isDetailLoading = true;
    _selectedStockDetail = null;
    _aiStudy = null;
    _errorMessage = null;
    notifyListeners();

    try {
      _selectedStockDetail = await _service.getStockDetail(symbol);
    } catch (e) {
      _errorMessage = 'Failed to load asset details for $symbol.';
    } finally {
      _isDetailLoading = false;
      notifyListeners();
    }
  }

  Future<void> generateAiStudy(String symbol) async {
    _isAiStudyLoading = true;
    notifyListeners();

    try {
      _aiStudy = await _service.generateAiStudy(symbol);
    } catch (e) {
      _errorMessage = 'Failed to generate AI study for $symbol.';
    } finally {
      _isAiStudyLoading = false;
      notifyListeners();
    }
  }

  Future<void> fetchLearningStats() async {
    try {
      _learningStats = await _service.getLearningStats();
      notifyListeners();
    } catch (_) {}
  }

  @override
  void dispose() {
    stopAutoRefresh();
    super.dispose();
  }
}
