"""
Canonical configuration for the Shipment Delivery Risk Score system.

This is the SINGLE source of truth for geography, time windows,
API endpoints, and model parameters. Every module imports from here.
"""
from __future__ import annotations

from datetime import date
from typing import NamedTuple


# ───────────────────────── TIME WINDOW ─────────────────────────
# Primary window: 2025-12-01 to 2026-02-28
# Fallback (if BTS data not yet published): 2024-01-01 to 2024-02-29
HISTORICAL_WINDOW_PRIMARY = (date(2025, 12, 1), date(2026, 2, 28))
HISTORICAL_WINDOW_FALLBACK = (date(2024, 1, 1), date(2024, 2, 29))

# Start with fallback since we're in mid-2026 and BTS usually lags 3-6 months
HISTORICAL_WINDOW: tuple[date, date] = HISTORICAL_WINDOW_FALLBACK


# ───────────────────────── GEOGRAPHY ─────────────────────────
class AirportInfo(NamedTuple):
    code: str
    name: str
    lat: float
    lon: float


AIRPORT_CODES: list[str] = [
    "ATL", "BOS", "ORD", "DFW", "DEN", "LAX", "SFO", "SEA", "JFK", "EWR",
    "MIA", "PHX", "IAH", "MSP", "DTW", "CLT", "LAS", "MCO", "SLC", "BWI",
    "DCA", "PHL", "SDF", "MEM", "IND", "OAK", "PDX", "STL", "TPA", "CVG",
]

# Real lat/lon for the 30 airports (from FAA / public data)
AIRPORTS: dict[str, AirportInfo] = {
    "ATL": AirportInfo("ATL", "Hartsfield-Jackson Atlanta", 33.6407, -84.4277),
    "BOS": AirportInfo("BOS", "Boston Logan", 42.3656, -71.0096),
    "ORD": AirportInfo("ORD", "Chicago O'Hare", 41.9742, -87.9073),
    "DFW": AirportInfo("DFW", "Dallas/Fort Worth", 32.8998, -97.0403),
    "DEN": AirportInfo("DEN", "Denver International", 39.8561, -104.6737),
    "LAX": AirportInfo("LAX", "Los Angeles International", 33.9425, -118.4081),
    "SFO": AirportInfo("SFO", "San Francisco International", 37.6213, -122.3790),
    "SEA": AirportInfo("SEA", "Seattle-Tacoma", 47.4502, -122.3088),
    "JFK": AirportInfo("JFK", "John F. Kennedy", 40.6413, -73.7781),
    "EWR": AirportInfo("EWR", "Newark Liberty", 40.6895, -74.1745),
    "MIA": AirportInfo("MIA", "Miami International", 25.7959, -80.2870),
    "PHX": AirportInfo("PHX", "Phoenix Sky Harbor", 33.4373, -112.0078),
    "IAH": AirportInfo("IAH", "George Bush Houston", 29.9902, -95.3368),
    "MSP": AirportInfo("MSP", "Minneapolis-St. Paul", 44.8848, -93.2223),
    "DTW": AirportInfo("DTW", "Detroit Metropolitan", 42.2124, -83.3534),
    "CLT": AirportInfo("CLT", "Charlotte Douglas", 35.2144, -80.9473),
    "LAS": AirportInfo("LAS", "Harry Reid Las Vegas", 36.0840, -115.1537),
    "MCO": AirportInfo("MCO", "Orlando International", 28.4312, -81.3081),
    "SLC": AirportInfo("SLC", "Salt Lake City", 40.7899, -111.9791),
    "BWI": AirportInfo("BWI", "Baltimore/Washington", 39.1754, -76.6684),
    "DCA": AirportInfo("DCA", "Ronald Reagan Washington", 38.8512, -77.0402),
    "PHL": AirportInfo("PHL", "Philadelphia International", 39.8744, -75.2424),
    "SDF": AirportInfo("SDF", "Louisville Muhammad Ali", 38.1744, -85.7360),
    "MEM": AirportInfo("MEM", "Memphis International", 35.0424, -89.9767),
    "IND": AirportInfo("IND", "Indianapolis International", 39.7173, -86.2944),
    "OAK": AirportInfo("OAK", "Oakland International", 37.7213, -122.2208),
    "PDX": AirportInfo("PDX", "Portland International", 45.5898, -122.5951),
    "STL": AirportInfo("STL", "St. Louis Lambert", 38.7487, -90.3700),
    "TPA": AirportInfo("TPA", "Tampa International", 27.9756, -82.5333),
    "CVG": AirportInfo("CVG", "Cincinnati/Northern KY", 39.0488, -84.6678),
}


class PortInfo(NamedTuple):
    code: str
    name: str
    lat: float
    lon: float


PORTS: dict[str, PortInfo] = {
    "USLGB": PortInfo("USLGB", "Port of Long Beach", 33.7540, -118.2160),
    "USLAX": PortInfo("USLAX", "Port of Los Angeles", 33.7361, -118.2640),
    "USNYC": PortInfo("USNYC", "Port of NY/NJ", 40.6700, -74.0500),
    "USSAV": PortInfo("USSAV", "Port of Savannah", 32.0835, -81.0998),
    "USHOU": PortInfo("USHOU", "Port of Houston", 29.7260, -95.2690),
    "USSEA": PortInfo("USSEA", "Port of Seattle-Tacoma", 47.2720, -122.4140),
    "USOAK": PortInfo("USOAK", "Port of Oakland", 37.7960, -122.2790),
    "USNFK": PortInfo("USNFK", "Port of Norfolk", 36.8468, -76.2852),
}


# ───────────────────────── RISK BANDS ─────────────────────────
def risk_band(score: float) -> str:
    """Map a 1.0-10.0 risk score to a named band."""
    if score < 3.5:
        return "LOW"
    elif score < 6.0:
        return "MEDIUM"
    elif score < 8.0:
        return "HIGH"
    else:
        return "CRITICAL"


def clamp(val: float, lo: float, hi: float) -> float:
    """Clamp a value to [lo, hi]."""
    return max(lo, min(hi, val))


def breach_prob_to_score(p_breach: float) -> float:
    """score = clamp(1 + 9 * P_breach_calibrated, 1, 10), 1 decimal."""
    return round(clamp(1.0 + 9.0 * p_breach, 1.0, 10.0), 1)


# ───────────────────────── API ENDPOINTS ─────────────────────────
# Open-Meteo (FREE, NO KEY)
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# GDELT DOC 2.0 (FREE, NO KEY)
GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

# TomTom Traffic Flow (requires TOMTOM_API_KEY)
TOMTOM_FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"

# AviationStack (requires AVIATIONSTACK_API_KEY)
AVIATIONSTACK_URL = "http://api.aviationstack.com/v1/flights"
AVIATIONSTACK_MONTHLY_LIMIT = 100  # free tier
AVIATIONSTACK_HARD_CAP = 60       # our hard limit (leave 40 for buffer)
AVIATIONSTACK_CACHE_HOURS = 6


# ───────────────────────── BTS DATA ─────────────────────────
BTS_COLUMNS_KEEP = [
    "FlightDate", "Reporting_Airline", "Origin", "Dest",
    "CRSDepTime", "DepDelay", "ArrDelay", "Cancelled", "Diverted",
    "Distance", "CarrierDelay", "WeatherDelay", "NASDelay",
    "LateAircraftDelay",
]


# ───────────────────────── PATHS ─────────────────────────
import pathlib

PROJECT_ROOT = pathlib.Path(__file__).resolve().parent.parent
ML_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = ML_DIR / "data"
ARTIFACTS_DIR = ML_DIR / "artifacts"
CACHE_DIR = DATA_DIR / "cache"
INGEST_DIR = ML_DIR / "ingest"

# Ensure directories exist
for d in [DATA_DIR, ARTIFACTS_DIR, CACHE_DIR, ARTIFACTS_DIR / "llm"]:
    d.mkdir(parents=True, exist_ok=True)


# ───────────────────────── MODEL PARAMS ─────────────────────────
BREACH_THRESHOLD_MINUTES = 15  # ArrDelay > 15 = breach (industry standard)
TARGET_BREACH_RATE = 0.20      # for simulated data
MIN_AIR_AUC = 0.45             # fail if below this
SAMPLE_CAP = 150_000           # downsample training set if larger
ACTIVE_FLEET_SIZE = 1_000
