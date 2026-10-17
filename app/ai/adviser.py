"""
AI Milk Production Adviser
==========================
Offline analytics engine using Pandas, NumPy, and Scipy.

Capabilities:
  1. Trend Detection      - Linear regression slope over rolling windows (7/14/30 days)
  2. Anomaly Detection    - z-score flagging of outlier sessions vs. per-cow 7-day baseline
  3. Causal Correlation   - Correlates production drops with:
                            a) Health records (active illness within N days before drop)
                            b) Feed reduction events (stock dropped below threshold)
                            c) Seasonal patterns (monthly average comparison)
  4. Smart Report         - Structured analysis object per animal AND herd-wide
  5. Excel Export         - Multi-tab workbook with summary KPIs, per-animal sheets,
                            anomaly tables, and embedded line charts
"""
from __future__ import annotations

import io
import warnings
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any

import numpy as np
import pandas as pd
from scipy import stats

warnings.filterwarnings("ignore", category=FutureWarning)


# ===========================================================================
# DATA CONTAINERS
# ===========================================================================

@dataclass
class AnomalyPoint:
    timestamp: datetime
    session: str
    volume_liters: float
    baseline_avg: float
    deviation_pct: float
    z_score: float
    probable_cause: str = "Unknown"
    health_event: Optional[str] = None
    feed_event: Optional[str] = None


@dataclass
class AnimalReport:
    animal_id: str
    tag_number: str
    name: Optional[str]
    breed: str
    analysis_period_days: int

    # Volume statistics
    total_volume_liters: float
    avg_daily_liters: float
    peak_daily_liters: float
    min_daily_liters: float

    # Trend
    trend_slope_liters_per_day: float
    trend_direction: str            # "Improving" | "Stable" | "Declining"
    trend_confidence: float         # R² value 0–1
    projected_7day_volume: float

    # Anomalies
    anomalies: List[AnomalyPoint]
    anomaly_count: int

    # Causal insights
    health_correlated_drops: int
    feed_correlated_drops: int
    seasonal_note: Optional[str]
    top_insight: str                # One-line actionable advice


@dataclass
class HerdReport:
    generated_at: datetime
    period_start: date
    period_end: date
    total_animals_analyzed: int
    total_herd_volume_liters: float
    avg_herd_daily_liters: float
    best_performer: Optional[str]   # tag_number
    worst_performer: Optional[str]
    animals_with_declining_trend: List[str]
    animals_with_anomalies: List[str]
    low_feed_alerts: List[str]
    total_milk_revenue: float
    total_expenses: float
    net_profit: float
    animal_reports: List[AnimalReport]


# ===========================================================================
# ADVISER ENGINE
# ===========================================================================

class MilkProductionAdviser:
    """
    Core analytics class.
    Usage:
        adviser = MilkProductionAdviser(
            milk_logs=<list of dicts>,
            health_records=<list of dicts>,
            feed_inventory=<list of dicts>,
            milk_sales=<list of dicts>,
            expenses=<list of dicts>,
            animals=<list of dicts>
        )
        herd_report = adviser.analyze(period_days=30)
    """

    Z_SCORE_THRESHOLD = 2.0          # Flag sessions deviating >2σ from cow baseline
    DECLINE_SLOPE_THRESHOLD = -0.05  # L/day slope that classifies as "Declining"
    HEALTH_WINDOW_DAYS = 5           # Days before a drop to check for health events
    MIN_DATA_POINTS = 3              # Skip analysis if fewer records

    def __init__(
        self,
        milk_logs: List[Dict],
        health_records: List[Dict],
        feed_inventory: List[Dict],
        animals: List[Dict],
        milk_sales: List[Dict],
        expenses: List[Dict],
    ):
        self.animals_df   = pd.DataFrame(animals)      if animals      else pd.DataFrame()
        self.health_df    = pd.DataFrame(health_records) if health_records else pd.DataFrame()
        self.feed_df      = pd.DataFrame(feed_inventory) if feed_inventory else pd.DataFrame()
        self.sales_df     = pd.DataFrame(milk_sales)   if milk_sales   else pd.DataFrame()
        self.expenses_df  = pd.DataFrame(expenses)     if expenses     else pd.DataFrame()

        # Build main production DataFrame
        self.prod_df = self._build_production_df(milk_logs)

    # ------------------------------------------------------------------
    # INTERNAL HELPERS
    # ------------------------------------------------------------------

    def _build_production_df(self, logs: List[Dict]) -> pd.DataFrame:
        if not logs:
            return pd.DataFrame()
        df = pd.DataFrame(logs)
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df["date"]      = df["timestamp"].dt.date
        df["volume_liters"] = pd.to_numeric(df["volume_liters"], errors="coerce")
        return df.sort_values("timestamp")

    def _daily_totals(self, animal_id: str) -> pd.DataFrame:
        """Aggregate all sessions into daily totals per cow."""
        sub = self.prod_df[self.prod_df["animal_id"] == animal_id]
        if sub.empty:
            return pd.DataFrame()
        daily = sub.groupby("date")["volume_liters"].sum().reset_index()
        daily.columns = ["date", "volume_liters"]
        daily["date"] = pd.to_datetime(daily["date"])
        return daily.sort_values("date")

    def _linear_trend(self, series: pd.Series) -> tuple[float, float, float]:
        """Return (slope, intercept, r_squared)."""
        x = np.arange(len(series))
        if len(x) < self.MIN_DATA_POINTS:
            return 0.0, float(series.mean()), 0.0
        slope, intercept, r, _, _ = stats.linregress(x, series.values)
        return float(slope), float(intercept), float(r ** 2)

    def _classify_trend(self, slope: float) -> str:
        if slope < self.DECLINE_SLOPE_THRESHOLD:
            return "Declining"
        if slope > 0.05:
            return "Improving"
        return "Stable"

    def _detect_anomalies(
        self, daily: pd.DataFrame, animal_id: str
    ) -> List[AnomalyPoint]:
        anomalies = []
        if len(daily) < self.MIN_DATA_POINTS:
            return anomalies

        # 7-day rolling mean & std
        daily = daily.copy()
        daily["rolling_mean"] = daily["volume_liters"].rolling(7, min_periods=2).mean().shift(1)
        daily["rolling_std"]  = daily["volume_liters"].rolling(7, min_periods=2).std().shift(1)
        daily = daily.dropna(subset=["rolling_mean", "rolling_std"])

        for _, row in daily.iterrows():
            std = row["rolling_std"] if row["rolling_std"] > 0 else 1.0
            z = (row["volume_liters"] - row["rolling_mean"]) / std
            if z < -self.Z_SCORE_THRESHOLD:
                dev_pct = (
                    (row["rolling_mean"] - row["volume_liters"]) / row["rolling_mean"] * 100
                ) if row["rolling_mean"] > 0 else 0.0

                cause, health_ev, feed_ev = self._infer_cause(
                    animal_id, row["date"].date()
                )
                anomalies.append(
                    AnomalyPoint(
                        timestamp=row["date"],
                        session="Daily",
                        volume_liters=round(row["volume_liters"], 2),
                        baseline_avg=round(row["rolling_mean"], 2),
                        deviation_pct=round(dev_pct, 1),
                        z_score=round(z, 2),
                        probable_cause=cause,
                        health_event=health_ev,
                        feed_event=feed_ev,
                    )
                )
        return anomalies

    def _infer_cause(
        self, animal_id: str, drop_date: date
    ) -> tuple[str, Optional[str], Optional[str]]:
        """
        Attempt to correlate production drop with known events.
        Returns (cause_label, health_event_description, feed_event_description)
        """
        health_ev = None
        feed_ev   = None

        # --- 1. Health correlation ---
        if not self.health_df.empty and "animal_id" in self.health_df.columns:
            animal_health = self.health_df[self.health_df["animal_id"] == animal_id]
            if not animal_health.empty:
                animal_health = animal_health.copy()
                animal_health["treatment_start_date"] = pd.to_datetime(
                    animal_health["treatment_start_date"]
                ).dt.date
                window_start = drop_date - timedelta(days=self.HEALTH_WINDOW_DAYS)
                recent = animal_health[
                    (animal_health["treatment_start_date"] >= window_start)
                    & (animal_health["treatment_start_date"] <= drop_date)
                ]
                if not recent.empty:
                    diag = recent.iloc[0]["diagnosis"]
                    health_ev = f"Health event: {diag} (started {recent.iloc[0]['treatment_start_date']})"

        # --- 2. Feed/inventory correlation ---
        if not self.feed_df.empty and "current_stock_kg" in self.feed_df.columns:
            low_feeds = self.feed_df[
                self.feed_df["current_stock_kg"] <= self.feed_df["low_stock_threshold_kg"]
            ]
            if not low_feeds.empty:
                names = ", ".join(low_feeds["feed_name"].tolist())
                feed_ev = f"Feed stock low: {names}"

        # --- 3. Determine dominant cause ---
        if health_ev:
            return f"Health-related drop ({health_ev.split(':')[1].strip().split(' ')[0]})", health_ev, feed_ev
        if feed_ev:
            return f"Feed shortage: {feed_ev.split(':')[1].strip()}", health_ev, feed_ev

        # --- 4. Seasonal check (month-over-month) ---
        month_name = drop_date.strftime("%B")
        seasonal_months = {"June", "July", "August", "December", "January"}
        if month_name in seasonal_months:
            return f"Possible seasonal variation ({month_name})", health_ev, feed_ev

        return "Unexplained — investigate manually", health_ev, feed_ev

    def _seasonal_note(self, daily: pd.DataFrame) -> Optional[str]:
        if len(daily) < 30:
            return None
        daily = daily.copy()
        daily["month"] = daily["date"].dt.month
        monthly = daily.groupby("month")["volume_liters"].mean()
        if monthly.empty:
            return None
        low_month  = monthly.idxmin()
        high_month = monthly.idxmax()
        delta = round(monthly.max() - monthly.min(), 1)
        month_names = {
            1:"Jan",2:"Feb",3:"Mar",4:"Apr",5:"May",6:"Jun",
            7:"Jul",8:"Aug",9:"Sep",10:"Oct",11:"Nov",12:"Dec"
        }
        return (
            f"Seasonal pattern detected: {delta}L/day variance. "
            f"Peak in {month_names.get(high_month,'?')}, "
            f"trough in {month_names.get(low_month,'?')}."
        )

    def _top_insight(self, report: AnimalReport) -> str:
        if report.trend_direction == "Declining" and report.health_correlated_drops > 0:
            return (
                f"⚠️ Production declining (-{abs(report.trend_slope_liters_per_day):.2f}L/day) "
                f"correlated with {report.health_correlated_drops} health event(s). "
                "Consult veterinarian immediately."
            )
        if report.trend_direction == "Declining" and report.feed_correlated_drops > 0:
            return (
                f"⚠️ Production declining correlated with low feed stock. "
                "Replenish feed supplies as a priority."
            )
        if report.trend_direction == "Declining":
            return (
                f"⚠️ Production declining (-{abs(report.trend_slope_liters_per_day):.2f}L/day). "
                "No clear health or feed cause found — consider environmental stress check."
            )
        if report.anomaly_count >= 3:
            return (
                f"⚡ {report.anomaly_count} production anomalies detected. "
                "Review individual anomaly dates for targeted action."
            )
        if report.trend_direction == "Improving":
            return f"✅ Production improving (+{report.trend_slope_liters_per_day:.2f}L/day). Maintain current regimen."
        return "✅ Production stable. Continue regular monitoring."

    # ------------------------------------------------------------------
    # MAIN ANALYSIS
    # ------------------------------------------------------------------

    def analyze(self, period_days: int = 30) -> HerdReport:
        end_date   = date.today()
        start_date = end_date - timedelta(days=period_days)

        if self.prod_df.empty:
            return self._empty_report(start_date, end_date)

        # Filter to period
        prod_period = self.prod_df[
            (self.prod_df["timestamp"].dt.date >= start_date)
            & (self.prod_df["timestamp"].dt.date <= end_date)
        ]

        animal_reports: List[AnimalReport] = []

        # Merge animal metadata
        animal_ids = prod_period["animal_id"].unique() if not prod_period.empty else []

        for animal_id in animal_ids:
            meta = {}
            if not self.animals_df.empty and "id" in self.animals_df.columns:
                row = self.animals_df[self.animals_df["id"] == animal_id]
                meta = row.iloc[0].to_dict() if not row.empty else {}

            daily = self._daily_totals(animal_id)
            # Limit to period
            daily = daily[
                (daily["date"].dt.date >= start_date)
                & (daily["date"].dt.date <= end_date)
            ] if not daily.empty else daily

            if daily.empty or len(daily) < self.MIN_DATA_POINTS:
                continue

            slope, intercept, r2 = self._linear_trend(daily["volume_liters"])
            anomalies = self._detect_anomalies(daily, animal_id)
            health_corr = sum(1 for a in anomalies if a.health_event)
            feed_corr   = sum(1 for a in anomalies if a.feed_event)
            seasonal    = self._seasonal_note(daily)

            projected = max(
                0.0,
                float((intercept + slope * (len(daily) + 7)) * 7)
            )

            ar = AnimalReport(
                animal_id=animal_id,
                tag_number=meta.get("tag_number", animal_id),
                name=meta.get("name"),
                breed=meta.get("breed", "Unknown"),
                analysis_period_days=len(daily),
                total_volume_liters=round(float(daily["volume_liters"].sum()), 2),
                avg_daily_liters=round(float(daily["volume_liters"].mean()), 2),
                peak_daily_liters=round(float(daily["volume_liters"].max()), 2),
                min_daily_liters=round(float(daily["volume_liters"].min()), 2),
                trend_slope_liters_per_day=round(slope, 4),
                trend_direction=self._classify_trend(slope),
                trend_confidence=round(r2, 3),
                projected_7day_volume=round(projected, 2),
                anomalies=anomalies,
                anomaly_count=len(anomalies),
                health_correlated_drops=health_corr,
                feed_correlated_drops=feed_corr,
                seasonal_note=seasonal,
                top_insight="",
            )
            ar.top_insight = self._top_insight(ar)
            animal_reports.append(ar)

        # Herd-level aggregations
        total_vol  = sum(r.total_volume_liters for r in animal_reports)
        avg_daily  = round(total_vol / period_days, 2) if period_days else 0.0
        declining  = [r.tag_number for r in animal_reports if r.trend_direction == "Declining"]
        anomalous  = [r.tag_number for r in animal_reports if r.anomaly_count > 0]
        best       = max(animal_reports, key=lambda r: r.avg_daily_liters).tag_number if animal_reports else None
        worst      = min(animal_reports, key=lambda r: r.avg_daily_liters).tag_number if animal_reports else None

        # Feed alerts
        low_feeds: List[str] = []
        if not self.feed_df.empty and "current_stock_kg" in self.feed_df.columns:
            lf = self.feed_df[self.feed_df["current_stock_kg"] <= self.feed_df["low_stock_threshold_kg"]]
            low_feeds = lf["feed_name"].tolist() if not lf.empty else []

        # Finance from preloaded data
        rev = float(self.sales_df["total_amount"].sum()) if not self.sales_df.empty and "total_amount" in self.sales_df.columns else 0.0
        exp = float(self.expenses_df["amount"].sum()) if not self.expenses_df.empty and "amount" in self.expenses_df.columns else 0.0

        return HerdReport(
            generated_at=datetime.utcnow(),
            period_start=start_date,
            period_end=end_date,
            total_animals_analyzed=len(animal_reports),
            total_herd_volume_liters=round(total_vol, 2),
            avg_herd_daily_liters=avg_daily,
            best_performer=best,
            worst_performer=worst,
            animals_with_declining_trend=declining,
            animals_with_anomalies=anomalous,
            low_feed_alerts=low_feeds,
            total_milk_revenue=round(rev, 2),
            total_expenses=round(exp, 2),
            net_profit=round(rev - exp, 2),
            animal_reports=animal_reports,
        )

    def _empty_report(self, start: date, end: date) -> HerdReport:
        return HerdReport(
            generated_at=datetime.utcnow(),
            period_start=start, period_end=end,
            total_animals_analyzed=0,
            total_herd_volume_liters=0.0,
            avg_herd_daily_liters=0.0,
            best_performer=None, worst_performer=None,
            animals_with_declining_trend=[],
            animals_with_anomalies=[],
            low_feed_alerts=[],
            total_milk_revenue=0.0, total_expenses=0.0, net_profit=0.0,
            animal_reports=[],
        )
