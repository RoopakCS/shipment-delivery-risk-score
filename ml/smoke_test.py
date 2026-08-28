"""
M0 Smoke Test - Verify all external APIs are reachable.

Hits: BTS (TranStats), Open-Meteo Archive, GDELT DOC 2.0,
      TomTom Traffic, AviationStack.
Prints PASS/FAIL for each.

Usage: python -m ml.smoke_test
"""
from __future__ import annotations

import asyncio
import os
import sys
import time

import httpx

from ml.config import (
    AIRPORTS,
    AVIATIONSTACK_URL,
    GDELT_DOC_URL,
    HISTORICAL_WINDOW,
    OPEN_METEO_ARCHIVE_URL,
    TOMTOM_FLOW_URL,
)


TIMEOUT = httpx.Timeout(30.0, connect=15.0)
results: list[tuple[str, bool, str]] = []


async def test_bts() -> None:
    """Test BTS TranStats availability - try the public data.gov mirror."""
    name = "BTS TranStats (data.gov mirror)"
    try:
        # Try data.gov API for on-time performance
        url = (
            "https://data.transportation.gov/resource/jfhf-q45h.json"
            "?$limit=5"
            "&$where=origin='ATL'"
        )
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                results.append((name, True, f"Got {len(data)} records"))
                return

        # Fallback: try BTS direct
        name = "BTS TranStats (direct)"
        url2 = "https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoession_ID=0&Table_ID=236&Has_Group=3"
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url2)
            if resp.status_code == 200:
                results.append((name, True, f"Page reachable (status {resp.status_code})"))
                return

        results.append((name, False, f"Both mirrors failed"))
    except Exception as e:
        results.append((name, False, str(e)[:120]))


async def test_open_meteo_archive() -> None:
    """Test Open-Meteo Archive API with a small request."""
    name = "Open-Meteo Archive"
    try:
        atl = AIRPORTS["ATL"]
        start = HISTORICAL_WINDOW[0].isoformat()
        end = HISTORICAL_WINDOW[0].isoformat()  # just 1 day
        params = {
            "latitude": atl.lat,
            "longitude": atl.lon,
            "start_date": start,
            "end_date": end,
            "daily": "precipitation_sum,snowfall_sum,wind_speed_10m_max,temperature_2m_min,temperature_2m_max",
            "timezone": "America/New_York",
        }
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(OPEN_METEO_ARCHIVE_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                daily = data.get("daily", {})
                results.append((name, True,
                    f"Got daily data for ATL on {start}: "
                    f"precip={daily.get('precipitation_sum', ['?'])[0]}mm"))
            else:
                results.append((name, False, f"HTTP {resp.status_code}: {resp.text[:100]}"))
    except Exception as e:
        results.append((name, False, str(e)[:120]))


async def test_gdelt() -> None:
    """Test GDELT DOC 2.0 API."""
    name = "GDELT DOC 2.0"
    try:
        params = {
            "query": "Atlanta airport delay",
            "mode": "artlist",
            "format": "json",
            "maxrecords": "5",
        }
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(GDELT_DOC_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                articles = data.get("articles", [])
                results.append((name, True, f"Got {len(articles)} articles"))
            else:
                results.append((name, False, f"HTTP {resp.status_code}: {resp.text[:100]}"))
    except Exception as e:
        results.append((name, False, str(e)[:120]))


async def test_tomtom() -> None:
    """Test TomTom Traffic Flow API (requires TOMTOM_API_KEY)."""
    name = "TomTom Traffic Flow"
    api_key = os.environ.get("TOMTOM_API_KEY", "")
    if not api_key:
        results.append((name, False, "TOMTOM_API_KEY not set (expected - optional)"))
        return
    try:
        # Test with ATL coordinates
        atl = AIRPORTS["ATL"]
        params = {
            "key": api_key,
            "point": f"{atl.lat},{atl.lon}",
        }
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(TOMTOM_FLOW_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                results.append((name, True, f"Got flow data"))
            elif resp.status_code == 403:
                results.append((name, False, f"Invalid API key (HTTP 403)"))
            else:
                results.append((name, False, f"HTTP {resp.status_code}: {resp.text[:100]}"))
    except Exception as e:
        results.append((name, False, str(e)[:120]))


async def test_aviationstack() -> None:
    """Test AviationStack API (requires AVIATIONSTACK_API_KEY)."""
    name = "AviationStack"
    api_key = os.environ.get("AVIATIONSTACK_API_KEY", "")
    if not api_key:
        results.append((name, False, "AVIATIONSTACK_API_KEY not set (expected - optional)"))
        return
    try:
        params = {
            "access_key": api_key,
            "dep_iata": "ATL",
            "limit": 1,
        }
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(AVIATIONSTACK_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                if "error" in data:
                    results.append((name, False, data["error"].get("message", "Unknown error")[:100]))
                else:
                    results.append((name, True,
                        f"Got {len(data.get('data', []))} flights"))
            else:
                results.append((name, False, f"HTTP {resp.status_code}"))
    except Exception as e:
        results.append((name, False, str(e)[:120]))


async def main() -> None:
    """Run all smoke tests."""
    print("=" * 70)
    print("M0 SMOKE TEST - External API Availability")
    print(f"Historical window: {HISTORICAL_WINDOW[0]} to {HISTORICAL_WINDOW[1]}")
    print(f"Geography: {len(AIRPORTS)} airports")
    print("=" * 70)
    print()

    tests = [
        test_bts(),
        test_open_meteo_archive(),
        test_gdelt(),
        test_tomtom(),
        test_aviationstack(),
    ]

    # Run sequentially to be polite to APIs
    for test in tests:
        await test
        await asyncio.sleep(0.5)

    # Print results
    print()
    print("-" * 70)
    all_pass = True
    critical_fail = False
    for name, passed, detail in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"  {status:8s}  {name:30s}  {detail}")
        if not passed:
            all_pass = False
            # BTS, Open-Meteo, GDELT are critical (free, no key)
            if any(x in name for x in ["BTS", "Open-Meteo", "GDELT"]):
                critical_fail = True

    print("-" * 70)
    if critical_fail:
        print("\n!! CRITICAL: One or more keyless APIs failed. Check network.")
        print("   BTS, Open-Meteo, and GDELT must be reachable to proceed.")
    elif not all_pass:
        print("\n!! Non-critical failures (keyed APIs). Can proceed without them.")
    else:
        print("\n>> All APIs reachable. Ready to proceed to M1.")
    print()


if __name__ == "__main__":
    asyncio.run(main())
