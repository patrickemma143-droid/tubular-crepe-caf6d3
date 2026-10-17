"""
FastAPI Application Entrypoint
=================================
Starts the Farm Management System server with:
  - All API routers registered
  - SQLite database initialized on startup
  - Default reminders seeded on first boot
  - APScheduler started for daily reminder jobs
  - CORS enabled for Electron/localhost frontend
  - WebSocket endpoint for real-time notification push
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db, AsyncSessionLocal
from app.scheduler import (
    init_scheduler,
    seed_default_reminders,
    load_and_schedule_reminders,
    start_scheduler,
    stop_scheduler,
)
from app.routers import animals, production, finances, health, reminders, adviser

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("farm.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    # ── STARTUP ──────────────────────────────────────────────────────────
    logger.info("🌱 Farm Management System starting up...")

    # 1. Create DB tables
    await init_db()
    logger.info("✅ Database initialized.")

    # 2. Seed default reminders on first boot
    async with AsyncSessionLocal() as db:
        await seed_default_reminders(db)

    # 3. Initialize & start the background reminder scheduler
    init_scheduler(AsyncSessionLocal)
    await load_and_schedule_reminders()
    start_scheduler()
    logger.info("⏰ Reminder scheduler started.")

    yield  # ── APPLICATION RUNNING ─────────────────────────────────────

    # ── SHUTDOWN ─────────────────────────────────────────────────────────
    stop_scheduler()
    logger.info("🛑 Farm Management System shut down.")


# ---------------------------------------------------------------------------
# APP INSTANCE
# ---------------------------------------------------------------------------

app = FastAPI(
    title="🐄 Farm Management System API",
    description=(
        "Offline-first Farm Management Operating System.\n\n"
        "Modules: Animal Records · Milk Production · Revenue & Expenses · "
        "Health Monitoring · Feed Management · AI Adviser · Daily Reminders"
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow Electron/Next.js (localhost) to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Lock down to specific port in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# ROUTERS
# ---------------------------------------------------------------------------

app.include_router(animals.router)
app.include_router(production.router)
app.include_router(finances.router)
app.include_router(health.router)
app.include_router(reminders.router)
app.include_router(adviser.router)


# ---------------------------------------------------------------------------
# ROOT HEALTH CHECK
# ---------------------------------------------------------------------------

@app.get("/", tags=["System"])
async def root():
    return {
        "system": "Farm Management System",
        "version": "1.0.0",
        "status": "online",
        "modules": [
            "Animal Records", "Milk Production", "Finances",
            "Health Monitoring", "Reminders", "AI Adviser",
        ],
        "docs": "/docs",
    }


@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "healthy"}
