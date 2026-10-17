"""
Background Reminder Scheduler
==============================
Uses APScheduler to run inside FastAPI's process.
Triggers daily reminders for:
  - 🥛 Morning milk recording
  - 🏥 Animal health check
  - 🌾 Feed inventory review
  - 💊 Medication due checks

Reminders are broadcast over a WebSocket channel so the React/Electron
frontend can display native-style notification banners immediately.
All times are local system time on the farm's machine.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import List, Dict, Any, Set

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("farm.scheduler")

# ---------------------------------------------------------------------------
# NOTIFICATION BROADCAST
# In-process WebSocket subscriber list so the frontend receives push alerts.
# ---------------------------------------------------------------------------
_active_connections: Set[Any] = set()


def register_ws(ws):
    _active_connections.add(ws)


def unregister_ws(ws):
    _active_connections.discard(ws)


async def _broadcast(notification: dict):
    """Push reminder to all connected frontend clients."""
    import json
    dead = set()
    for ws in _active_connections:
        try:
            await ws.send_text(json.dumps(notification))
        except Exception:
            dead.add(ws)
    _active_connections.difference_update(dead)
    if notification:
        logger.info(f"[Reminder] Broadcast: {notification.get('title', '')} to {len(_active_connections)} client(s)")


# ---------------------------------------------------------------------------
# REMINDER PAYLOADS
# ---------------------------------------------------------------------------

REMINDER_TEMPLATES: Dict[str, dict] = {
    "Daily Milk": {
        "title":   "🥛 Time to Record Milk Production",
        "body":    "Don't forget to log today's milking data for all active cows. "
                   "Tap here to open the Quick Milk Entry form.",
        "action":  "/production/quick-entry",
        "priority": "high",
    },
    "Evening Milk": {
        "title":   "🌙 Evening Milk Recording Reminder",
        "body":    "Record the evening milking session for all dairy cows.",
        "action":  "/production/quick-entry",
        "priority": "high",
    },
    "Animal Health": {
        "title":   "🏥 Daily Animal Health Check",
        "body":    "Review and update health status for all animals. "
                   "Flag any new symptoms, treatments, or observations.",
        "action":  "/health/daily-check",
        "priority": "medium",
    },
    "Feed Check": {
        "title":   "🌾 Feed Inventory Check",
        "body":    "Verify feed stock levels and log today's feeding. "
                   "Reorder if any feed is below threshold.",
        "action":  "/feed/inventory",
        "priority": "medium",
    },
    "Medication Due": {
        "title":   "💊 Medication & Treatment Review",
        "body":    "Check for animals with pending medications or treatment updates.",
        "action":  "/health/treatments",
        "priority": "high",
    },
}


# ---------------------------------------------------------------------------
# SCHEDULER SETUP
# ---------------------------------------------------------------------------

_scheduler: AsyncIOScheduler | None = None
_db_session_factory = None


def init_scheduler(session_factory):
    """
    Call this once at application startup.
    `session_factory` = AsyncSessionLocal from database.py
    """
    global _scheduler, _db_session_factory
    _db_session_factory = session_factory
    _scheduler = AsyncIOScheduler(timezone="local")
    return _scheduler


async def _trigger_reminder(task_type: str):
    """Compose and broadcast a reminder, then log it to the DB."""
    template = REMINDER_TEMPLATES.get(task_type, {
        "title":   f"📋 Reminder: {task_type}",
        "body":    f"It's time to complete your {task_type} task.",
        "action":  "/dashboard",
        "priority": "medium",
    })
    notification = {
        **template,
        "task_type": task_type,
        "triggered_at": datetime.now().isoformat(),
    }
    await _broadcast(notification)

    # Persist last_triggered timestamp
    if _db_session_factory:
        try:
            async with _db_session_factory() as db:
                from app.crud import mark_reminder_triggered
                await mark_reminder_triggered(db, task_type)
        except Exception as e:
            logger.warning(f"Could not update reminder DB record: {e}")


async def load_and_schedule_reminders():
    """
    Load all enabled reminders from the database and register
    APScheduler cron jobs dynamically.
    """
    if not _scheduler or not _db_session_factory:
        return

    # Clear existing jobs
    _scheduler.remove_all_jobs()

    try:
        async with _db_session_factory() as db:
            from sqlalchemy import select
            from app.models import ReminderConfiguration
            result = await db.execute(
                select(ReminderConfiguration).where(
                    ReminderConfiguration.is_enabled == True  # noqa
                )
            )
            reminders = result.scalars().all()

        for reminder in reminders:
            hour, minute = reminder.scheduled_time.split(":")
            task_type = reminder.task_type

            _scheduler.add_job(
                _trigger_reminder,
                trigger=CronTrigger(hour=int(hour), minute=int(minute)),
                args=[task_type],
                id=f"reminder_{task_type}",
                replace_existing=True,
                name=reminder.label,
            )
            logger.info(
                f"[Scheduler] Registered: '{reminder.label}' at {reminder.scheduled_time} daily"
            )
    except Exception as e:
        logger.error(f"[Scheduler] Failed to load reminders: {e}")


async def seed_default_reminders(db):
    """
    On first boot, create sensible default reminders if the table is empty.
    """
    from sqlalchemy import select
    from app.models import ReminderConfiguration
    from app.crud import upsert_reminder
    from app.schemas import ReminderConfigCreate

    result = await db.execute(select(ReminderConfiguration))
    existing = result.scalars().all()

    if not existing:
        defaults = [
            ReminderConfigCreate(
                task_type="Daily Milk",
                label="Morning Milk Recording",
                scheduled_time="05:30",
                is_enabled=True,
                message="🥛 Record morning milk production for all cows.",
            ),
            ReminderConfigCreate(
                task_type="Evening Milk",
                label="Evening Milk Recording",
                scheduled_time="17:00",
                is_enabled=True,
                message="🌙 Record evening milk production for all cows.",
            ),
            ReminderConfigCreate(
                task_type="Animal Health",
                label="Daily Animal Health Check",
                scheduled_time="07:00",
                is_enabled=True,
                message="🏥 Review and update all animal health statuses.",
            ),
            ReminderConfigCreate(
                task_type="Feed Check",
                label="Feed Inventory Review",
                scheduled_time="08:00",
                is_enabled=True,
                message="🌾 Check feed stock levels and log daily feeding.",
            ),
            ReminderConfigCreate(
                task_type="Medication Due",
                label="Medication & Treatment Check",
                scheduled_time="09:00",
                is_enabled=True,
                message="💊 Review pending medications and treatment schedules.",
            ),
        ]
        for d in defaults:
            await upsert_reminder(db, d)
        logger.info("[Scheduler] Default reminders seeded.")


def start_scheduler():
    if _scheduler and not _scheduler.running:
        _scheduler.start()
        logger.info("[Scheduler] APScheduler started.")


def stop_scheduler():
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] APScheduler stopped.")
