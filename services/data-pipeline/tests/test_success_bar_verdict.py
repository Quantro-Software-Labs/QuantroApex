"""Tests for the pre-registered success bar verdict logic across all three outcomes."""

from config import MLSuccessBar
from evaluation.metrics import evaluate_success_bar


def test_verdict_insufficient_data():
    """Fewer than 300 pooled trades triggers INSUFFICIENT_DATA regardless of Sharpe."""
    bar = MLSuccessBar(min_pooled_trades=300)

    verdict, checks = evaluate_success_bar(
        pooled_trades=250,  # < 300
        model_sharpe=3.5,
        bnh_sharpe=1.0,
        rule_sharpe=0.8,
        bootstrap_90_lb=0.5,
        positive_folds_pct=80.0,
        max_drawdown_pct=-15.0,
        bar=bar,
    )
    assert verdict == "INSUFFICIENT_DATA"
    assert checks["min_trades_passed"] is False


def test_verdict_edge_supported():
    """All 5 pre-registered conditions hold simultaneously -> EDGE_SUPPORTED."""
    bar = MLSuccessBar(min_pooled_trades=300, min_positive_fold_pct=60.0, max_drawdown_limit_pct=-35.0)

    verdict, checks = evaluate_success_bar(
        pooled_trades=420,  # >= 300
        model_sharpe=2.1,   # > B&H and > Rule
        bnh_sharpe=1.2,
        rule_sharpe=0.9,
        bootstrap_90_lb=0.25, # > 0
        positive_folds_pct=75.0, # >= 60%
        max_drawdown_pct=-22.0,  # > -35%
        bar=bar,
    )
    assert verdict == "EDGE_SUPPORTED"
    assert all(checks.values())


def test_verdict_no_evidence_of_edge_bootstrap_fails():
    """When bootstrap 90% lower bound <= 0, verdict is NO_EVIDENCE_OF_EDGE."""
    bar = MLSuccessBar(min_pooled_trades=300)

    verdict, checks = evaluate_success_bar(
        pooled_trades=350,
        model_sharpe=1.8,
        bnh_sharpe=1.5,
        rule_sharpe=1.2,
        bootstrap_90_lb=-0.05,  # <= 0 !
        positive_folds_pct=70.0,
        max_drawdown_pct=-20.0,
        bar=bar,
    )
    assert verdict == "NO_EVIDENCE_OF_EDGE"
    assert checks["bootstrap_lb_passed"] is False


def test_verdict_no_evidence_of_edge_drawdown_fails():
    """When drawdown is worse than -35% (e.g. -42%), verdict is NO_EVIDENCE_OF_EDGE."""
    bar = MLSuccessBar(min_pooled_trades=300, max_drawdown_limit_pct=-35.0)

    verdict, checks = evaluate_success_bar(
        pooled_trades=500,
        model_sharpe=1.9,
        bnh_sharpe=1.0,
        rule_sharpe=0.5,
        bootstrap_90_lb=0.3,
        positive_folds_pct=80.0,
        max_drawdown_pct=-42.0,  # worse than -35%!
        bar=bar,
    )
    assert verdict == "NO_EVIDENCE_OF_EDGE"
    assert checks["max_drawdown_passed"] is False


def test_verdict_no_evidence_of_edge_folds_fails():
    """When positive folds < 60%, verdict is NO_EVIDENCE_OF_EDGE."""
    bar = MLSuccessBar(min_pooled_trades=300, min_positive_fold_pct=60.0)

    verdict, checks = evaluate_success_bar(
        pooled_trades=500,
        model_sharpe=1.9,
        bnh_sharpe=1.0,
        rule_sharpe=0.5,
        bootstrap_90_lb=0.3,
        positive_folds_pct=50.0,  # < 60%
        max_drawdown_pct=-20.0,
        bar=bar,
    )
    assert verdict == "NO_EVIDENCE_OF_EDGE"
    assert checks["positive_folds_passed"] is False
