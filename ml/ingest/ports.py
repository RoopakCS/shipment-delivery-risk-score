"""
Port congestion data ingestion.

Two layers:
  1. Baseline: hardcoded real published median port dwell times from
     port_dwell.csv (with source comments for each number).
  2. Live/dynamic: GDELT news disruption score for that port.

Combines into port_congestion_index.
Saves ml/data/ports_hist.parquet.
"""
from __future__ import annotations

import pandas as pd

from ml.config import DATA_DIR, HISTORICAL_WINDOW, PORTS

OUTPUT_PATH = DATA_DIR / "ports_hist.parquet"
PORT_DWELL_CSV = DATA_DIR / "port_dwell.csv"


def _load_baseline_dwell() -> pd.DataFrame:
    """Load static port dwell times from the committed CSV."""
    df = pd.read_csv(PORT_DWELL_CSV, comment='#')
    print(f"  [PORTS] Loaded baseline dwell times for {len(df)} ports")
    for _, row in df.iterrows():
        print(f"    {row['port_code']}: {row['median_dwell_days']:.1f} days "
              f"({row['source_note'][:60]}...)")
    return df


def _compute_port_congestion(
    dwell_days: float, news_risk: float
) -> float:
    """Combine baseline dwell and news risk into port_congestion_index.

    Normalized 0-1 where:
    - Dwell component: days/7 (7+ days = max baseline congestion)
    - News component: direct risk score
    - Combined: 60% baseline + 40% news (news is the live component)
    """
    dwell_score = min(1.0, dwell_days / 7.0)
    combined = 0.6 * dwell_score + 0.4 * news_risk
    return round(min(1.0, combined), 4)


def ingest_ports(news_df: pd.DataFrame | None = None) -> pd.DataFrame:
    """Main entry: combine baseline dwell with news data per port per day.

    Args:
        news_df: News data from gdelt_hist.py (if available).
                 Expected columns: location, date, news_risk_score.

    Returns DataFrame with port congestion data.
    """
    start, end = HISTORICAL_WINDOW

    print(f"\n{'='*60}")
    print(f"[M2] Port Congestion Data")
    print(f"  Window: {start} to {end}")
    print(f"  Ports: {len(PORTS)}")
    print(f"{'='*60}")

    baseline = _load_baseline_dwell()
    dwell_map = dict(zip(baseline["port_code"], baseline["median_dwell_days"]))

    dates = pd.date_range(start, end, freq="D")
    records = []

    for port_code in PORTS:
        dwell = dwell_map.get(port_code, 3.5)  # default if missing

        for d in dates:
            # Get news risk for this port+date
            news_risk = 0.0
            if news_df is not None:
                mask = (news_df["location"] == port_code) & (news_df["date"] == d)
                news_rows = news_df[mask]
                if len(news_rows) > 0:
                    news_risk = float(news_rows.iloc[0]["news_risk_score"])

            congestion = _compute_port_congestion(dwell, news_risk)

            records.append({
                "port_code": port_code,
                "date": d,
                "median_dwell_days": dwell,
                "news_risk_score": news_risk,
                "port_congestion_index": congestion,
                "is_live_news": news_risk > 0,
                "is_live_baseline": False,  # baseline is static
            })

    df = pd.DataFrame(records)
    df.to_parquet(OUTPUT_PATH, index=False)

    print(f"\n  [PORTS] RESULTS:")
    print(f"    Total rows:           {len(df):,}")
    print(f"    Ports:                {df['port_code'].nunique()}")
    print(f"    Mean congestion:      {df['port_congestion_index'].mean():.4f}")
    print(f"    Max congestion:       {df['port_congestion_index'].max():.4f}")
    print(f"    Days with live news:  {df['is_live_news'].sum()}")
    print(f"    Saved to:             {OUTPUT_PATH}")

    return df


if __name__ == "__main__":
    # Try loading existing news data
    news_path = DATA_DIR / "news_hist.parquet"
    news = pd.read_parquet(news_path) if news_path.exists() else None
    ingest_ports(news)
