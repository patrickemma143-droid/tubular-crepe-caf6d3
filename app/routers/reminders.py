"""Reminders Configuration API Router"""
from typing import List
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app import crud, schemas
from app.scheduler import (
    register_ws, unregister_ws,
    load_and_schedule_reminders,
)

router = APIRouter(prefix="/reminders", tags=["Reminders"])


@router.get("/", response_model=List[schemas.ReminderConfigResponse],
            summary="Get all reminder configurations")
async def list_reminders(db: AsyncSession = Depends(get_db)):
    return await crud.get_all_reminders(db)


@router.post("/", response_model=schemas.ReminderConfigResponse, status_code=201,
             summary="Create or update a reminder")
async def upsert_reminder(
    data: schemas.ReminderConfigCreate, db: AsyncSession = Depends(get_db)
):
    result = await crud.upsert_reminder(db, data)
    # Reload the scheduler so the new time takes effect immediately
    await load_and_schedule_reminders()
    return result


@router.patch("/{reminder_id}", response_model=schemas.ReminderConfigResponse,
              summary="Update reminder time or enabled flag")
async def update_reminder(
    reminder_id: str,
    data: schemas.ReminderConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.models import ReminderConfiguration
    result_q = await db.execute(
        select(ReminderConfiguration).where(ReminderConfiguration.id == reminder_id)
    )
    reminder = result_q.scalar_one_or_none()
    if not reminder:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Reminder not found.")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(reminder, field, val)
    await db.commit()
    await db.refresh(reminder)
    await load_and_schedule_reminders()
    return reminder


# ── WEBSOCKET: Live Notification Push ──────────────────────────────────────

@router.websocket("/ws/notifications")
async def notification_websocket(websocket: WebSocket):
    """
    The frontend connects here to receive real-time reminder push notifications.
    When the APScheduler fires a reminder job, it broadcasts a JSON message
    to all connected clients over this WebSocket.

    Message format:
    {
        "title": "🥛 Time to Record Milk Production",
        "body": "...",
        "action": "/production/quick-entry",
        "priority": "high",
        "task_type": "Daily Milk",
        "triggered_at": "2025-01-15T06:00:00"
    }
    """
    await websocket.accept()
    register_ws(websocket)
    try:
        while True:
            # Keep connection alive; server pushes data, client just listens
            await websocket.receive_text()
    except WebSocketDisconnect:
        unregister_ws(websocket)
