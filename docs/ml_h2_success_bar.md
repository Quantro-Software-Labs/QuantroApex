# Pre-Registered ML Evaluation Protocol & Success Bar (Hypothesis 2: Daily Regime Allocation)

**Pre-registration Date**: 2026-11-23  
**Status**: ACTIVE (Pre-registered prior to any H2 model training or testing)  
**Parent Investigation**: H1 (Short-horizon SMC entries) gave `NO_EVIDENCE_OF_EDGE` and is permanently closed.

---

## 1. Core Hypothesis & Universe

- **Hypothesis**: A daily model deciding, per coin, "hold" or "cash" beats holding the coins (buy-and-hold equal-weight basket) and beats a simple trend filter, after realistic execution costs.
- **Universe**: 
  - BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, XRP/USDT.
  - Daily bars at 00:00 UTC close, constructed from 1h spot Parquet history (2019-01-01 to latest UTC close; SOL from its listing date 2020-08-11).
- **Positions & Portfolio Execution**:
  - Fixed 20% sleeve per coin (5 coins total = 100% portfolio capacity).
  - Each sleeve is binary: either fully **held** (invested in that coin) or in **cash** (0% yield).
  - Decisions are evaluated at the daily close (00:00 UTC) and executed at the next day's open.
  - **Turnover Limit**: A coin must stay in a given state (hold or cash) for at least 7 days before it can switch.
  - **Monthly Sleeve Rebalance**: Equal-weight 20% target sleeves are rebalanced monthly on the 1st of each calendar month.

---

## 2. Execution Costs

- **Primary Cost**: 0.40% per side (40 bps per side $\rightarrow$ **80 bps / 0.80% round-trip**) on every state switch (matching the platform crypto SIM execution model).
- **Rebalance Cost**: 0.40% per side applied to capital reallocated during monthly sleeve rebalancing.

---

## 3. Label Definition

- **Label Horizon**: 7 days forward.
- **Label**:
  $$\text{label} = \begin{cases} 1 & \text{if next 7-day open-to-open return} > +0.80\% \\ 0 & \text{otherwise} \end{cases}$$
- Open-to-open return is computed from day $t+1$ open to day $t+8$ open.

---

## 4. Feature Set (Strictly Causal & Daily Only)

No intraday leakage, no lookahead. All features computed strictly at daily bar $t$ close:
1. Returns over 1 day (`ret_1d`)
2. Returns over 7 days (`ret_7d`)
3. Returns over 30 days (`ret_30d`)
4. Returns over 90 days (`ret_90d`)
5. 30-day realised volatility (`vol_30d`: standard deviation of daily close returns over 30 days $\times \sqrt{365}$)
6. Distance from 90-day high (`dist_high_90d`: $(close_t - \max(high_{t-89:t})) / \max(high_{t-89:t})$)
7. Price vs 50-day SMA (`sma_ratio_50`: $(close_t - SMA_{50}(close)) / SMA_{50}(close)$)
8. Price vs 200-day SMA (`sma_ratio_200`: $(close_t - SMA_{200}(close)) / SMA_{200}(close)$)
9. BTC's 30-day return (`btc_ret_30d`)
10. BTC's 90-day return (`btc_ret_90d`)
11. Coin's 30-day return minus basket's 30-day return (`excess_ret_30d`: $ret\_30d_{coin} - \text{mean}(ret\_30d_{all\_active\_coins})$)

*Strict negative constraint: Nothing else.*

---

## 5. Model Architecture & Decision Rule

- **Primary Model**: LightGBM Classifier (`LGBMClassifier`):
  - `num_leaves`: 15
  - `learning_rate`: 0.05
  - `n_estimators`: 300
  - `min_child_samples`: 50
  - `subsample`: 0.8
  - `colsample_bytree`: 0.8
  - `random_state`: 42
  - No tuning, no hyperparameters search, no threshold search.
- **Decision Rule**: Hold coin if predicted probability $p \ge 0.5$; else cash. Subject to the 7-day minimum holding rule.
- **Sanity Model**: Logistic Regression (`LogisticRegression(C=1.0, max_iter=1000)`). Reported alongside LightGBM for sanity checking; LightGBM alone governs the verdict.

---

## 6. Validation Framework & Purging

- **Folds**: 12-month rolling train, 3-month test, 3-month step.
- **Purging**:
  - With a 7-day label horizon, training samples whose 7-day forward window reaches or crosses test start ($t + 7\text{ days} \ge \text{test\_start}$) are strictly purged from training.
  - An embargo of at least 1 day (24 hours) is enforced.
  - Effective train end is at least 8 days prior to test start.
- **Holdout Integrity**:
  - The SAME holdout cutoff timestamp as H1 is strictly preserved (last 6 months of dataset).
  - Development walk-forward stops at the holdout cutoff. The holdout is locked behind `--final-holdout`.

---

## 7. Baselines

All baselines subject to the same daily open execution, 80 bps round-trip switch fees, and monthly rebalancing fees:
1. **Equal-Weight Basket**: 20% sleeve per active coin, 100% held always, monthly rebalanced with fees.
2. **100-Day SMA Filter**: Hold coin if $close_t > SMA_{100}(close_t)$, else cash. Same 7-day minimum hold and transaction costs.
3. **BTC-Only Buy & Hold**: For reference only.

---

## 8. Evaluation Metrics

Computed on daily mark-to-market portfolio equity curves:
- **Sharpe Ratio**: Daily return Sharpe annualised with $\sqrt{365}$.
- **Max Drawdown**: Peak-to-trough decline of mark-to-market daily equity.
- **CAGR**: Compound annual growth rate.
- **Switches per coin per month**: Mean monthly switches per active asset.

---

## 9. Pre-Registered Success Bar Criteria

The machine verdict is strictly computed on pooled out-of-sample test results after realistic costs:

### Verdict: `EDGE_SUPPORTED`
Requires ALL of the following to pass:
1. **Sharpe > Basket Sharpe**: Model pooled out-of-sample Sharpe strictly exceeds Equal-Weight Basket Sharpe.
2. **Sharpe > SMA-Filter Sharpe**: Model pooled out-of-sample Sharpe strictly exceeds 100-Day SMA Filter Sharpe.
3. **Bootstrap Lower Bound > 0**: 20-day block bootstrap 90% lower bound of $(\text{Sharpe}_{\text{model}} - \text{Sharpe}_{\text{basket}}) > 0$.
4. **Shallower Max Drawdown**: Model max drawdown is at least 15 percentage points shallower than the Equal-Weight Basket max drawdown ($\text{MaxDD}_{\text{model}} - \text{MaxDD}_{\text{basket}} \ge 0.15$).
5. **Positive Relative Folds $\ge 50\%$**: Model Sharpe > Basket Sharpe in at least 50% of walk-forward folds.
6. **Turnover Constraint**: Average switches $\le 4$ per coin per month.

### Verdict: `INSUFFICIENT_DATA`
- Emitted if total switches across all coins out-of-sample is $< 100$.

### Verdict: `NO_EVIDENCE_OF_EDGE`
- Emitted if any criterion above fails.

### Trend Filter Diagnostic
- Also report, without altering the verdict: whether the SMA filter alone beats the basket on the same criteria (`TREND_FILTER_SUPPORTED: True/False`).
