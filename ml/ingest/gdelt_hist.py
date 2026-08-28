"""
Historical news/disruption data ingestion from GDELT DOC 2.0 API.

FREE, NO API KEY required.

Design notes (why this looks the way it does):
  - GDELT's historical queries take 25-31 seconds to return. The previous
    implementation used a 30s timeout with no retries, which sat right on the
    edge and lost nearly every request, silently zero-filling the whole signal.
    We now use a 90s timeout with retries and backoff.
  - We query the `timelinevolraw` and `timelinetone` modes rather than
    `artlist`. Those return the ENTIRE daily series for the window in a single
    request, so we need ~2 calls per location instead of one call per
    location-day, and we are not capped at 75 articles.
  - Requests run concurrently (bounded) because each one is slow but cheap.

Produces news_risk_score in 0-1 per (location, date), combining how unusual the
article volume is for that location with how negative the coverage tone is.

Saves ml/data/news_hist.parquet.
"""
from __future__ import annotations

import asyncio
import json

import httpx
import numpy as np
import pandas as pd

from ml.config import (
    CACHE_DIR,
    DATA_DIR,
    GDELT_DOC_URL,
    HISTORICAL_WINDOW,
)

OUTPUT_PATH = DATA_DIR / "news_hist.parquet"
NEWS_CACHE_DIR = CACHE_DIR / "gdelt"

# GDELT historical queries are slow (measured 25-31s). Do not lower the timeout.
#
# Concurrency MUST stay at 1. GDELT rate-limits aggressively: requests issued
# even 2-at-a-time come back as ConnectError, and a short burst gets the client
# temporarily blocked for everything, including queries that worked moments
# before. Sequential with a polite delay is the only reliable mode.
GDELT_TIMEOUT_S = 90.0
GDELT_RETRIES = 4
GDELT_CONCURRENCY = 1
REQUEST_DELAY_S = 2.0
RETRY_BACKOFF_S = 5.0

# Abort rather than silently zero-fill if the API is genuinely down.
MAX_FAILURE_RATE = 0.5

# Search terms for logistics disruptions
DISRUPTION_TERMS = [
    "strike", "closure", "congestion", "storm", "protest",
    "backlog", "delay", "shutdown",
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


# GDELT allows roughly one request per 30s and blocks bursts, so a full
# backfill of all 38 locations takes ~40 minutes. For the hackathon build we
# backfill only the lanes the demo actually visits; every other location is
# emitted with a zero score so downstream joins keep their shape. In a real
# deployment this backfill runs once, offline, for the full set.
PRIORITY_LOCATIONS: list[str] = [
    "ORD", "DEN", "MSP", "SDF", "EWR", "DFW",  # airports
    "USLGB", "USNYC",                          # ports
]


def _build_query(search_term: str) -> str:
    """Combine a location term with the disruption vocabulary."""
    disruption_query = " OR ".join(DISRUPTION_TERMS)
    return f'({search_term}) AND ({disruption_query})'


async def _fetch_timeline(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    location_code: str,
    search_term: str,
    mode: str,
    start_dt: str,
    end_dt: str,
) -> list[dict] | None:
    """Fetch one GDELT timeline series, with disk cache and retries.

    Returns the raw `data` list of {date, value} points, or None if every
    attempt failed.
    """
    cache_file = NEWS_CACHE_DIR / f"{location_code}_{mode}_{start_dt}_{end_dt}.json"
    if cache_file.exists():
        with open(cache_file) as f:
            return json.load(f)

    params = {
        "query": _build_query(search_term),
        "mode": mode,
        "format": "json",
        "startdatetime": start_dt,
        "enddatetime": end_dt,
    }

    async with sem:
        for attempt in range(1, GDELT_RETRIES + 1):
            try:
                resp = await client.get(GDELT_DOC_URL, params=params)
                if resp.status_code != 200:
                    raise httpx.HTTPStatusError(
                        f"HTTP {resp.status_code}", request=resp.request, response=resp
                    )
                payload = resp.json()
                timeline = payload.get("timeline", [])
                data = timeline[0].get("data", []) if timeline else []

                cache_file.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_file, "w") as f:
                    json.dump(data, f)
                print(f"    {location_code}/{mode}: {len(data)} points")
                await asyncio.sleep(REQUEST_DELAY_S)
                return data

            except Exception as e:
                if attempt == GDELT_RETRIES:
                    print(f"    {location_code}/{mode}: FAILED after "
                          f"{GDELT_RETRIES} attempts ({type(e).__name__})")
                    return None
                await asyncio.sleep(RETRY_BACKOFF_S * attempt)  # linear backoff

    return None


def _timeline_to_series(data: list[dict] | None, value_name: str) -> pd.DataFrame:
    """Convert a GDELT timeline `data` list into a tidy date/value frame."""
    if not data:
        return pd.DataFrame(columns=["date", value_name])

    rows = []
    for point in data:
        dt = pd.to_datetime(point.get("date", ""), format="%Y%m%dT%H%M%SZ",
                            errors="coerce")
        if pd.isna(dt):
            continue
        rows.append({"date": dt.normalize(), value_name: float(point.get("value", 0))})

    if not rows:
        return pd.DataFrame(columns=["date", value_name])

    return pd.DataFrame(rows).groupby("date", as_index=False)[value_name].mean()


def _compute_risk(
    volume: pd.DataFrame, tone: pd.DataFrame, location_code: str,
    start_date, end_date,
) -> pd.DataFrame:
    """Combine volume and tone series into a daily news_risk_score in 0-1.

    Volume is scored RELATIVE to the location's own baseline, so a busy news
    market like New York is not permanently flagged as high risk. What matters
    is an unusual spike in disruption coverage for that place.
    """
    all_dates = pd.date_range(start_date, end_date, freq="D")
    df = pd.DataFrame({"date": all_dates})
    df["location"] = location_code

    df = df.merge(volume, on="date", how="left")
    df = df.merge(tone, on="date", how="left")
    # An empty timeline merges in as an object column, so cast before filling.
    for col in ("news_article_count", "news_avg_tone"):
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    counts = df["news_article_count"].to_numpy(dtype=float)
    median = float(np.median(counts))
    p90 = float(np.percentile(counts, 90))
    spread = max(p90 - median, 1.0)  # guard against a flat series
    volume_score = np.clip((counts - median) / spread, 0.0, 1.0)

    # GDELT tone: negative is more negative coverage. -10 is very negative.
    tone_score = np.clip(-df["news_avg_tone"].to_numpy(dtype=float), 0.0, 10.0) / 10.0

    df["news_risk_score"] = np.round(
        np.clip(0.6 * volume_score + 0.4 * tone_score, 0.0, 1.0), 4
    )
    df["news_article_count"] = df["news_article_count"].astype(int)
    df["news_avg_tone"] = df["news_avg_tone"].round(4)

    return df[["location", "date", "news_article_count", "news_avg_tone",
               "news_risk_score"]]


async def _gather_all(
    locations: dict[str, str], start_dt: str, end_dt: str
) -> dict[str, tuple[list[dict] | None, list[dict] | None]]:
    """Fetch volume + tone timelines for every location concurrently."""
    sem = asyncio.Semaphore(GDELT_CONCURRENCY)
    timeout = httpx.Timeout(GDELT_TIMEOUT_S)
    headers = {"User-Agent": "Mozilla/5.0 (compatible; ShipmentRiskScore/1.0)"}

    async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
        tasks = {
            code: (
                _fetch_timeline(client, sem, code, term, "timelinevolraw",
                                start_dt, end_dt),
                _fetch_timeline(client, sem, code, term, "timelinetone",
                                start_dt, end_dt),
            )
            for code, term in locations.items()
        }
        results = await asyncio.gather(
            *[coro for pair in tasks.values() for coro in pair]
        )

    out: dict[str, tuple[list[dict] | None, list[dict] | None]] = {}
    for i, code in enumerate(tasks):
        out[code] = (results[2 * i], results[2 * i + 1])
    return out


def ingest_gdelt_hist() -> pd.DataFrame:
    """Main entry: query GDELT for all locations, save news_hist.parquet.

    Raises RuntimeError if more than MAX_FAILURE_RATE of locations fail, so a
    dead API surfaces as an error instead of a silently zero-filled signal.
    """
    start, end = HISTORICAL_WINDOW
    start_dt = start.strftime("%Y%m%d") + "000000"
    end_dt = end.strftime("%Y%m%d") + "235959"

    all_locations = {**AIRPORT_METRO, **PORT_SEARCH}
    locations = {k: v for k, v in all_locations.items() if k in PRIORITY_LOCATIONS}
    skipped = [k for k in all_locations if k not in locations]

    print(f"\n{'='*60}")
    print(f"[M2] Historical News Ingestion (GDELT DOC 2.0)")
    print(f"  Window:      {start} to {end}")
    print(f"  Fetching:    {len(locations)} priority locations "
          f"({len(skipped)} zero-filled)")
    print(f"  Concurrency: {GDELT_CONCURRENCY}, timeout {GDELT_TIMEOUT_S:.0f}s, "
          f"{GDELT_RETRIES} retries")
    print(f"{'='*60}")

    raw = asyncio.run(_gather_all(locations, start_dt, end_dt))

    frames: list[pd.DataFrame] = []
    failed: list[str] = []

    for code in locations:
        vol_raw, tone_raw = raw[code]
        if vol_raw is None and tone_raw is None:
            failed.append(code)

        volume = _timeline_to_series(vol_raw, "news_article_count")
        tone = _timeline_to_series(tone_raw, "news_avg_tone")
        frames.append(_compute_risk(volume, tone, code, start, end))

    # Non-priority locations get an explicit zero series so the parquet keeps
    # one row per (location, date) for every location the joins expect.
    for code in skipped:
        frames.append(_compute_risk(
            pd.DataFrame(columns=["date", "news_article_count"]),
            pd.DataFrame(columns=["date", "news_avg_tone"]),
            code, start, end,
        ))

    failure_rate = len(failed) / len(locations)
    if failure_rate > MAX_FAILURE_RATE:
        raise RuntimeError(
            f"FATAL: GDELT failed for {len(failed)}/{len(locations)} locations "
            f"({failure_rate:.0%}). Refusing to write a zero-filled news signal. "
            f"Failed: {', '.join(failed[:10])}"
        )

    combined = pd.concat(frames, ignore_index=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(OUTPUT_PATH, index=False)

    nonzero = (combined["news_risk_score"] > 0).mean()
    print(f"\n  [GDELT] RESULTS:")
    print(f"    Total rows:       {len(combined):,}")
    print(f"    Locations:        {combined['location'].nunique()}")
    print(f"    Failed locations: {len(failed)}")
    print(f"    Non-zero risk:    {nonzero:.1%} of rows")
    print(f"    Mean risk score:  {combined['news_risk_score'].mean():.4f}")
    print(f"    Max risk score:   {combined['news_risk_score'].max():.4f}")
    print(f"    Saved to:         {OUTPUT_PATH}")

    if nonzero < 0.05:
        print("    WARNING: news signal is almost entirely zero - "
              "check query terms before training.")

    return combined


if __name__ == "__main__":
    ingest_gdelt_hist()
