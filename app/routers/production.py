"""Milk Production Tracking API Router"""
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app import crud, schemas

router = APIRouter(prefix="/production", tags=["Milk Production"])


@router.post("/log", response_model=schemas.MilkLogResponse, status_code=201,
             summary="Log a single milk session")
async def log_milk(data: schemas.MilkLogCreate, db: AsyncSession = Depends(get_db)):
    animal = await crud.get_animal(db, data.animal_id)
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found.")
    if animal.status != "Active":
        raise HTTPException(status_code=400, detail=f"Animal is {animal.status} — cannot log production.")
    return await crud.log_milk_production(db, data)


@router.post("/bulk-log", response_model=List[schemas.MilkLogResponse], status_code=201,
             summary="📋 Quick Daily Entry — bulk log for multiple cows in one form submit")
async def bulk_log_milk(payload: schemas.BulkMilkEntry, db: AsyncSession = Depends(get_db)):
    """
    Single-click daily entry form endpoint.
    The frontend submits one JSON body with entries for all cows in the herd.
    Ideal for the 'Record Today's Milking' button on the dashboard.
    """
    if not payload.entries:
        raise HTTPException(status_code=422, detail="No entries provided.")
    logs = await crud.bulk_log_milk(db, payload.entries)
    return logs


@router.get("/{animal_id}/history", response_model=List[schemas.MilkLogResponse],
            summary="Get production history for a cow")
async def get_milk_history(
    animal_id: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = Query(500, le=1000),
    db: AsyncSession = Depends(get_db),
):
    return await crud.get_milk_history(db, animal_id, start_date, end_date, limit)
