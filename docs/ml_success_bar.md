# Pre-Registered Machine Learning Success Bar

> **Status**: PRE-REGISTERED & IMMUTABLE  
> **Effective Date**: 2026-11-21  
> **Scope**: QuantroApex ML Trading Strategy Validation (`services/data-pipeline`)  
> **Rule**: This success bar is defined prior to evaluation and must never be altered retroactively after model runs.

---

## 1. Overview & Purpose

To eliminate p-hacking, selection bias, and overfitting, all quantitative assessments of strategy efficacy must be governed by this pre-registered success bar. Interpretive narratives ("preserved capital", "outperforming", "promising signal") are prohibited in validation output. The evaluation pipeline emits quantitative metrics and exactly one machine verdict:

- `EDGE_SUPPORTED`
- `NO_EVIDENCE_OF_EDGE`
- `INSUFFICIENT_DATA`

---

## 2. Decision Logic & Thresholds

### The Criteria for `EDGE_SUPPORTED`
A strategy is declared `EDGE_SUPPORTED` if and only if **ALL five conditions** hold simultaneously on pooled out-of-sample (OOS) results net of execution fees and slippage:

1. **Statistical Power**:
   $$\text{Trades}_{\text{pooled}} \ge 300$$
   A minimum of 300 out-of-sample closed trades across all evaluation folds.

2. **Dual-Benchmark Sharpe Dominance**:
   $$\text{Sharpe}_{\text{model}} > \text{Sharpe}_{\text{buy\_and\_hold}} \quad \text{and} \quad \text{Sharpe}_{\text{model}} > \text{Sharpe}_{\text{rule\_only}}$$
   Sharpe must be computed from **daily equity returns** (days without open positions count as $0.0$), annualised with $\sqrt{365}$ for crypto and $\sqrt{252}$ for stocks.

3. **Block Bootstrap Significance**:
   $$\text{Bootstrap}_{90\%\ \text{Lower Bound}}(\text{Sharpe}_{\text{model}} - \text{Sharpe}_{\text{buy\_and\_hold}}) > 0.0$$
   Evaluated using a 20-day block bootstrap on the daily returns series with $B = 1,000$ resamples. The 10th percentile difference must be strictly positive.

4. **Consistency Across Folds**:
   $$\frac{\text{Positive Folds}}{N_{\text{total folds}}} \ge 60\%$$
   At least 60% of individual rolling walk-forward test folds must achieve a positive net return after costs.

5. **Risk & Capital Preservation**:
   $$\text{Max Drawdown}_{\text{pooled}} > -35.0\%$$
   Maximum peak-to-trough drawdown of the pooled out-of-sample equity curve must be better than $-35.0\%$ (e.g. $-25\%$ passes, $-40\%$ fails).

---

### Fallback Verdicts

- **`INSUFFICIENT_DATA`**:
  Triggered whenever $\text{Trades}_{\text{pooled}} < 300$. When sample size is inadequate to establish statistical significance, no edge claim or dismissal is certified.

- **`NO_EVIDENCE_OF_EDGE`**:
  Triggered when $\text{Trades}_{\text{pooled}} \ge 300$, but any of conditions (2) through (5) fail.

---

## 3. Fold-Level Trade Threshold

Any individual walk-forward fold with fewer than 30 trades ($\text{Trades}_{\text{fold}} < 30$) reports its fold Sharpe ratio as `null` with machine reason:
```json
{
  "annualized_sharpe": null,
  "sharpe_reason": "INSUFFICIENT_TRADES"
}
```
Trades from low-count folds remain fully included in the pooled out-of-sample metric calculations.

---

## 4. Final Holdout Governance

1. The final 6 months of historical data for each asset are sealed as an untouched holdout set.
2. The holdout is never accessible during feature engineering, model training, or hyperparameter selection.
3. Access to the holdout requires explicit invocation with `--final-holdout`. Every access is cryptographically audited and appended with an ISO-8601 UTC timestamp to `holdout_access.log`.
