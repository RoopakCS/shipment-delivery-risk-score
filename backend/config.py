"""
Backend configuration.
"""
from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Database
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./risk_score.db")

# CORS
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")

# ML artifacts
ML_DIR = Path(__file__).resolve().parent.parent / "ml"
ARTIFACTS_DIR = ML_DIR / "artifacts"
DATA_DIR = ML_DIR / "data"
