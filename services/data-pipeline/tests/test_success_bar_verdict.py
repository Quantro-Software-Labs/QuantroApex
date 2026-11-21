"""Tests for the pre-registered success bar verdict logic across all three outcomes."""

from config import MLSuccessBar
from evaluation.metrics import evaluate_success_bar


def test_verdict_insufficient_data():
    """Fewer than 300 pooled trades triggers INSUFFICIENT_DATA, but actual pass/fail of criteria is reported."""
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
    assert checks["sharpe_above_bnh"] is True
    assert checks["sharpe_above_rule"] is True
    assert checks["bootstrap_lb_passed"] is True
    assert checks["positive_folds_passed"] is True
    assert checks["max_drawdown_passed"] is True


def test_verdict_insufficient_data_with_actual_partial_passes():
    """
    Test case specified by prompt:
    trades < 300 (e.g. 8 trades), max drawdown -4% passes the -35% bar,
    model Sharpe -3.55 is above rule-only's -5.96 (passes), but below B&H -3.36 (fails).
    Verdict is INSUFFICIENT_DATA, but per-criterion checks report true pass/fail states.
    """
    bar = MLSuccessBar(min_pooled_trades=300, max_drawdown_limit_pct=-35.0)

    verdict, checks = evaluate_success_bar(
        pooled_trades=8,
        model_sharpe=-3.55,
        bnh_sharpe=-3.36,
        rule_sharpe=-5.96,
        bootstrap_90_lb=-0.19,
        positive_folds_pct=0.0,
        max_drawdown_pct=-4.0,  # -4% > -35% -> True
        bar=bar,
    )
    assert verdict == "INSUFFICIENT_DATA"
    assert checks["min_trades_passed"] is False
    assert checks["max_drawdown_passed"] is True  # -4% passes -35%
    assert checks["sharpe_above_rule"] is True    # -3.55 > -5.96 passes
    assert checks["sharpe_above_bnh"] is False   # -3.55 not > -3.36
    assert checks["bootstrap_lb_passed"] is False


def test_smoke_mode_verdict_smoke_only():
    """Smoke mode can never emit a verdict: it reports SMOKE_ONLY."""
    verdict, checks = evaluate_success_bar(
        pooled_trades=500,
        model_sharpe=2.5,
        bnh_sharpe=1.0,
        rule_sharpe=0.5,
        bootstrap_90_lb=0.4,
        positive_folds_pct=80.0,
        max_drawdown_pct=-10.0,
        smoke=True,
    )
    assert verdict == "SMOKE_ONLY"
    assert "Smoke" in checks.get("reason", "")


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
