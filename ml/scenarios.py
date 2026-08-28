"""
Pinned demo scenarios: real historical disruption days replayed through the
live model.

Why this exists
---------------
The active fleet is scored against LIVE weather. That is correct behaviour, but
it means the dashboard looks calm whenever the real world is calm - refreshing
in August produces no storms and therefore no high-risk shipments.

These scenarios pin a handful of shipments to dates when severe weather
genuinely occurred, using the real Open-Meteo archive values for those days.
Nothing about the risk score is hardcoded: the model scores them exactly like
any other shipment. Only the weather inputs are historical rather than live,
which is why /api/refresh deliberately skips them.

Each scenario is a real, checkable weather event:
  ORD 2024-01-09  - Chicago blizzard, 18.7 cm snowfall
  EWR 2024-02-13  - Northeast winter storm, 19.9 cm snowfall
  BOS 2024-01-07  - Boston snowstorm, 16.6 cm snowfall
  ATL 2024-02-20  - control case: clear conditions, should score LOW
"""
from __future__ import annotations

import pandas as pd

from ml.config import DATA_DIR

SCENARIO_PREFIX = "DEMO-"

# (id, origin, date, headline shown in the UI)
SCENARIOS: list[tuple[str, str, str, str]] = [
    ("DEMO-ORD-BLIZZARD", "ORD", "2024-01-09",
     "Chicago blizzard - 18.7cm snowfall recorded"),
    ("DEMO-EWR-STORM", "EWR", "2024-02-13",
     "Northeast winter storm - 19.9cm snowfall recorded"),
    ("DEMO-BOS-SNOW", "BOS", "2024-01-07",
     "Boston snowstorm - 16.6cm snowfall recorded"),
    ("DEMO-ATL-CLEAR", "ATL", "2024-02-20",
     "Control case - clear conditions"),
]


def build_scenarios() -> pd.DataFrame:
    """Append pinned scenario shipments to active.parquet.

    Each scenario clones a real AIR shipment from the active fleet and swaps in
    the true recorded weather for that airport and date. Returns the scenario
    rows that were added.
    """
    active_path = DATA_DIR / "active.parquet"
    active = pd.read_parquet(active_path)

    # Drop any scenarios from a previous run so this is idempotent.
    active = active[~active["id"].astype(str).str.startswith(SCENARIO_PREFIX)]

    weather = pd.read_parquet(DATA_DIR / "weather_hist.parquet")
    weather["date"] = pd.to_datetime(weather["date"])
    wx = weather.set_index(["airport", "date"])

    template = active[active["mode"] == "AIR"].iloc[0]
    airports = pd.read_csv(DATA_DIR / "airports.csv").set_index("code")

    rows = []
    for ship_id, airport, date_str, headline in SCENARIOS:
        key = (airport, pd.Timestamp(date_str))
        if key not in wx.index:
            print(f"  [SCENARIO] skipped {ship_id}: no weather for {key}")
            continue
        w = wx.loc[key]

        row = template.copy()
        row["id"] = ship_id
        row["origin_code"] = airport
        row["origin_name"] = airports.loc[airport, "name"]
        row["origin_lat"] = airports.loc[airport, "lat"]
        row["origin_lon"] = airports.loc[airport, "lon"]

        sev = float(w["weather_severity"])
        row["weather_severity_origin"] = sev
        row["weather_severity_route_max"] = max(
            sev, float(row.get("weather_severity_dest", 0.0)))
        row["precip_mm"] = float(w["precipitation_sum"])
        row["snowfall_cm"] = float(w["snowfall_sum"])
        row["wind_kph"] = float(w["wind_speed_10m_max"])

        rows.append(row)
        print(f"  [SCENARIO] {ship_id}: {airport} {date_str} "
              f"severity={sev:.3f} snow={float(w['snowfall_sum']):.1f}cm")

    scenarios = pd.DataFrame(rows)
    combined = pd.concat([active, scenarios], ignore_index=True)
    combined.to_parquet(active_path, index=False)
    print(f"  [SCENARIO] active.parquet now has {len(combined):,} shipments")

    return scenarios


if __name__ == "__main__":
    build_scenarios()
