"""
Historical news/disruption data ingestion from GDELT DOC 2.0 API.

FREE, NO API KEY required.
Queries per metro/port for logistics-disruption terms.
Aggregates article volume and average tone into news_risk_score 0-1
per (location, date).

Graceful degradation: if GDELT is unreachable (as seen in M0 smoke test),
generates zero-risk fallback data and logs a warning.

Saves ml/data/news_hist.parquet.
"""
from __future__ import annotations

import json
import time
from datetime import timedelta

import httpx
import numpy as np
import pandas as pd

from ml.config import (
    AIRPORTS,
    CACHE_DIR,
    DATA_DIR,
    GDELT_DOC_URL,
    HISTORICAL_WINDOW,
    PORTS,
)

OUTPUT_PATH = DATA_DIR / "news_hist.parquet"
NEWS_CACHE_DIR = CACHE_DIR / "gdelt"

# Search terms for logistics disruptions
DISRUPTION_TERMS = [
    "strike", "port closure", "congestion", "storm", "protest",
    "backlog", "delay", "shutdown", "supply chain",
]

# Map airports to metro search terms
AIRPORT_METRO: dict[str, str] = {
    "ATL": "Atlanta", "BOS": "Boston", "ORD": "Chicago", "DFW": "Dallas",
    "DEN": "Denver", "LAX": "Los Angeles", "SFO": "San Francisco",
    "SEA": "Seattle", "JFK": "New York", "EWR": "Newark", "MIA": "Miami",
    "PHX": "Phoenix", "IAH": "Houston", "MSP": "Minneapolis", "DTW": "Detroit",
    "CLT": "Charlotte", "LAS": "Las Vegas", "MCO": "Orlando",
    "SLC": "Salt Lake City", "BWI": "Baltimore", "DCA": "Washington DC",
    "PHL": "Philadelphia", "SDF": "Louisville", "MEM": "Memphis",
    "IND": "Indianapolis", "OAK": "Oakland", "PDX": "Portland",
    "STL": "St Louis", "TPA": "Tampa", "CVG": "Cincinnati",
}

PORT_SEARCH: dict[str, str] = {
    "USLGB": "Long Beach port", "USLAX": "Los Angeles port",
    "USNYC": "New York New Jersey port", "USSAV": "Savannah port",
    "USHOU": "Houston port", "USSEA": "Seattle Tacoma port",
    "USOAK": "Oakland port", "USNFK": "Norfolk port",
}


def _query_gdelt(search_term: str, start_dt: str, end_dt: str,
                 max_records: int = 75) -> list[dict] | None:
    """Query GDELT DOC 2.0 API. Returns list of articles or None on failure."""
    # Build query combining location and disruption terms
    disruption_query = " OR ".join(DISRUPTION_TERMS)
    query = f'({search_term}) AND ({disruption_query})'

    params = {
        "query": query,
        "mode": "artlist",
        "format": "json",
        "startdatetime": start_dt,
        "enddatetime": end_dt,
        "maxrecords": str(max_records),
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(GDELT_DOC_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("articles", [])
            else:
                return None
    except Exception:
        return None


def _articles_to_daily_risk(
    articles: list[dict], location_code: str, start_date, end_date
) -> pd.DataFrame:
    """Convert articles into daily news_risk_score per location.

    Risk based on article volume (more articles = more disruption coverage)
    and tone (negative tone = worse).
    """
    if not articles:
        # No articles found = no disruption signal
        dates = pd.date_range(start_date, end_date, freq="D")
        return pd.DataFrame({
            "location": location_code,
            "date": dates,
            "news_article_count": 0,
            "news_avg_tone": 0.0,
            "news_risk_score": 0.0,
        })

    # Parse articles
    records = []
    for art in articles:
        try:
            dt = pd.to_datetime(art.get("seendate", ""), format="%Y%m%dT%H%M%S",
                                errors="coerce")
            if pd.isna(dt):
                continue
            tone = float(art.get("tone", 0))
            records.append({"date": dt.date(), "tone": tone})
        except (ValueError, TypeError):
            continue

    if not records:
        dates = pd.date_range(start_date, end_date, freq="D")
        return pd.DataFrame({
            "location": location_code,
            "date": dates,
            "news_article_count": 0,
            "news_avg_tone": 0.0,
            "news_risk_score": 0.0,
        })

    art_df = pd.DataFrame(records)
    art_df["date"] = pd.to_datetime(art_df["date"])

    # Aggregate per day
    daily = art_df.groupby("date").agg(
        news_article_count=("tone", "count"),
        news_avg_tone=("tone", "mean"),
    ).reset_index()

    # Compute risk score:
    # - Volume component: more articles = higher risk (cap at 20 articles)
    # - Tone component: more negative tone = higher risk
    daily["volume_score"] = (daily["news_article_count"] / 20.0).clip(0, 1)
    daily["tone_score"] = ((-daily["news_avg_tone"]).clip(0, 10) / 10.0)
    daily["news_risk_score"] = (
        0.6 * daily["volume_score"] + 0.4 * daily["tone_score"]
    ).clip(0, 1).round(4)

    daily["location"] = location_code
    daily = daily.drop(columns=["volume_score", "tone_score"])

    # Fill missing dates with 0
    all_dates = pd.date_range(start_date, end_date, freq="D")
    full = pd.DataFrame({"date": all_dates})
    full["location"] = location_code
    merged = full.merge(daily, on=["date", "location"], how="left")
    merged["news_article_count"] = merged["news_article_count"].fillna(0).astype(int)
    merged["news_avg_tone"] = merged["news_avg_tone"].fillna(0.0)
    merged["news_risk_score"] = merged["news_risk_score"].fillna(0.0)

    return merged


def _generate_fallback_news_data() -> pd.DataFrame:
    """Generate zero-risk fallback when GDELT is unreachable.

    This is NOT synthetic training data - it's a neutral signal (no news = no
    disruption detected). Clearly logged.
    """
    start, end = HISTORICAL_WINDOW
    dates = pd.date_range(start, end, freq="D")

    all_locations = list(AIRPORT_METRO.keys()) + list(PORT_SEARCH.keys())
    records = []
    for loc in all_locations:
        for d in dates:
            records.append({
                "location": loc,
                "date": d,
                "news_article_count": 0,
                "news_avg_tone": 0.0,
                "news_risk_score": 0.0,
            })

    return pd.DataFrame(records)


def ingest_gdelt_hist() -> pd.DataFrame:
    """Main entry: query GDELT for all locations, save news_hist.parquet.

    Gracefully degrades to zero-risk data if GDELT is unreachable.
    """
    start, end = HISTORICAL_WINDOW
    # GDELT datetime format: YYYYMMDDHHMMSS
    start_dt = start.strftime("%Y%m%d") + "000000"
    end_dt = end.strftime("%Y%m%d") + "235959"

    print(f"\n{'='*60}")
    print(f"[M2] Historical News Ingestion (GDELT DOC 2.0)")
    print(f"  Window: {start} to {end}")
    print(f"  Locations: {len(AIRPORT_METRO)} airports + {len(PORT_SEARCH)} ports")
    print(f"{'='*60}")

    # Test connectivity first with a simple query
    test_articles = _query_gdelt("Atlanta airport", start_dt, end_dt, max_records=3)

    if test_articles is None:
        print("  [GDELT] WARNING: GDELT API is unreachable (network timeout).")
        print("  [GDELT] Using zero-risk fallback (no news = no disruption signal).")
        print("  [GDELT] This is NOT synthetic data - it's a neutral baseline.")
        df = _generate_fallback_news_data()
        df.to_parquet(OUTPUT_PATH, index=False)
        print(f"  [GDELT] Saved fallback to {OUTPUT_PATH} ({len(df):,} rows)")
        return df

    frames: list[pd.DataFrame] = []
    failed_count = 0

    # Query airports
    print("  [GDELT] Querying airports...")
    for code, metro in AIRPORT_METRO.items():
        cache_file = NEWS_CACHE_DIR / f"airport_{code}_{start}_{end}.json"
        if cache_file.exists():
            with open(cache_file) as f:
                articles = json.load(f)
            print(f"    {code}: cached ({len(articles)} articles)")
        else:
            articles = _query_gdelt(f"{metro} airport", start_dt, end_dt)
            if articles is None:
                articles = []
                failed_count += 1
                print(f"    {code}: FAILED (using 0)")
            else:
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_file, "w") as f:
                    json.dump(articles, f)
                print(f"    {code}: {len(articles)} articles")

            time.sleep(1.5)  # Rate limit

        daily_df = _articles_to_daily_risk(articles, code, start, end)
        frames.append(daily_df)

    # Query ports
    print("  [GDELT] Querying ports...")
    for code, search in PORT_SEARCH.items():
        cache_file = NEWS_CACHE_DIR / f"port_{code}_{start}_{end}.json"
        if cache_file.exists():
            with open(cache_file) as f:
                articles = json.load(f)
            print(f"    {code}: cached ({len(articles)} articles)")
        else:
            articles = _query_gdelt(search, start_dt, end_dt)
            if articles is None:
                articles = []
                failed_count += 1
                print(f"    {code}: FAILED (using 0)")
            else:
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_file, "w") as f:
                    json.dump(articles, f)
                print(f"    {code}: {len(articles)} articles")

            time.sleep(1.5)

        daily_df = _articles_to_daily_risk(articles, code, start, end)
        frames.append(daily_df)

    combined = pd.concat(frames, ignore_index=True)
    combined.to_parquet(OUTPUT_PATH, index=False)

    print(f"\n  [GDELT] RESULTS:")
    print(f"    Total rows:       {len(combined):,}")
    print(f"    Locations:        {combined['location'].nunique()}")
    print(f"    Failed queries:   {failed_count}")
    print(f"    Mean risk score:  {combined['news_risk_score'].mean():.4f}")
    print(f"    Max risk score:   {combined['news_risk_score'].max():.4f}")
    print(f"    Saved to:         {OUTPUT_PATH}")

    return combined


if __name__ == "__main__":
    ingest_gdelt_hist()
