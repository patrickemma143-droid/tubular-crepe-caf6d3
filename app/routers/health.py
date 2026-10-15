"""Health Records API Router"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app import crud, schemas

router = APIRouter(prefix="/health", tags=["Animal Health"])


@router.post("/", response_model=schemas.HealthRecordResponse, status_code=201,
             summary="Create a health record for an animal")
async def create_health_record(
    data: schemas.HealthRecordCreate, db: AsyncSession = Depends(get_db)
):
    animal = await crud.get_animal(db, data.animal_id)
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found.")
    return await crud.create_health_record(db, data)


@router.patch("/{record_id}", response_model=schemas.HealthRecordResponse,
              summary="Update health record (recovery status, vet notes)")
async def update_health_record(
    record_id: str,
    data: schemas.HealthRecordUpdate,
    db: AsyncSession = Depends(get_db),
):
    record = await crud.update_health_record(db, record_id, data)
    if not record:
        raise HTTPException(status_code=404, detail="Health record not found.")
    return record


@router.get("/active", response_model=List[schemas.HealthRecordResponse],
            summary="List all animals currently under treatment")
async def list_active_health_issues(db: AsyncSession = Depends(get_db)):
    return await crud.get_active_health_issues(db)
