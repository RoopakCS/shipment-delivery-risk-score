# Shipment Delivery Risk Score

**Hackathon Prototype** - UPS Placement Drive

Predict delivery risk for in-transit shipments using real transportation data, historical weather, and live signals.

## What Makes This Different

- **Real training data**: US BTS flight on-time performance (not synthetic)
- **Real weather**: Open-Meteo historical + live forecast
- **Real validation**: Backtested against actual disruption events
- **No external AI APIs**: Local model inference only
- **Live signals**: Weather, news, traffic, flight status at runtime

> **Disclosure**: Shipment records themselves are simulated (UPS parcel data is not public). We disclose this openly. The ML model and all external signals use real data.

## Score Definition

```
score = clamp(1 + 9 * P_breach_calibrated, 1, 10)
```

| Band | Score Range | Meaning |
|------|-----------|---------|
| LOW | 1.0 - 3.4 | On track |
| MEDIUM | 3.5 - 5.9 | Monitor |
| HIGH | 6.0 - 7.9 | Action needed |
| CRITICAL | 8.0 - 10.0 | Immediate action |

## Quick Start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the ML pipeline
```bash
# Step 1: Smoke test APIs
python -m ml.smoke_test

# Step 2: Ingest data (BTS flights, weather, news)
python -m ml.ingest.bts
python -m ml.ingest.weather_archive
python -m ml.ingest.gdelt_hist
python -m ml.ingest.ports

# Step 3: Build training datasets
python -m ml.build_dataset

# Step 4: Train models
python -m ml.train

# Step 5: Run backtest
python -m ml.backtest
```

### 3. Start the backend
```bash
# Seed the database
python -m backend.seed

# Start FastAPI server
python -m backend.main
# or: uvicorn backend.main:app --reload --port 8000
```

### 4. Start the frontend
```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | System health + provider status |
| GET | `/api/stats` | Dashboard summary statistics |
| GET | `/api/shipments` | List shipments (filterable) |
| GET | `/api/shipments/{id}` | Full shipment detail |
| POST | `/api/refresh` | Re-pull live signals + rescore |
| GET | `/api/model/metrics` | Training metrics + calibration |
| GET | `/api/backtest` | List backtest events |
| GET | `/api/backtest/{id}` | Backtest event detail |

## Data Sources

| Source | Type | Key Required | Used For |
|--------|------|-------------|----------|
| BTS TranStats | Historical | No | Flight delay training labels |
| Open-Meteo | Historical + Live | No | Weather features |
| GDELT DOC 2.0 | Historical + Live | No | News disruption signals |
| TomTom Traffic | Live | Yes (optional) | Last-mile congestion |
| AviationStack | Live | Yes (optional) | Real-time flight delays |

## Architecture

```
ml/
  config.py          # Canonical geography, time windows, params
  features.py        # Feature schema (single source of truth)
  build_dataset.py   # Join real data into training sets
  train.py           # LightGBM + calibration + SHAP
  backtest.py        # Validate against real disruptions
  ingest/            # Data acquisition modules
  data/              # Parquet datasets + static CSVs
  artifacts/         # Trained models + metrics

backend/
  main.py            # FastAPI application
  scoring.py         # ML inference engine
  recommend.py       # Action recommendation (template)
  seed.py            # Database seeder
  providers/         # Live signal providers

frontend/            # Vite + React + TypeScript
```

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLModel, SQLite
- **ML**: LightGBM, scikit-learn, SHAP, pandas
- **Frontend**: Vite, React 18, TypeScript, TailwindCSS, Recharts
- **No external AI APIs** - all inference is local
