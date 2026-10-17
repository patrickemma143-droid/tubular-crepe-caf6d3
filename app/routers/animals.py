"""Animal Record Management API Router"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app import crud, schemas

router = APIRouter(prefix="/animals", tags=["Animals"])


@router.post("/", response_model=schemas.AnimalResponse, status_code=201,
             summary="Register a new animal")
async def create_animal(data: schemas.AnimalCreate, db: AsyncSession = Depends(get_db)):
    existing = await crud.get_animal_by_tag(db, data.tag_number)
    if existing:
        raise HTTPException(status_code=409, detail=f"Animal with tag '{data.tag_number}' already exists.")
    return await crud.create_animal(db, data)


@router.get("/", response_model=List[schemas.AnimalResponse],
            summary="List animals (filter by status)")
async def list_animals(
    status: Optional[str] = Query("Active", description="Active | Deceased | Sold | Archived | all"),
    skip: int = 0,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    status_filter = None if status == "all" else status
    return await crud.list_animals(db, status=status_filter, skip=skip, limit=limit)


@router.get("/{animal_id}", response_model=schemas.AnimalResponse,
            summary="Get a single animal by ID")
async def get_animal(animal_id: str, db: AsyncSession = Depends(get_db)):
    animal = await crud.get_animal(db, animal_id)
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found.")
    return animal


@router.patch("/{animal_id}", response_model=schemas.AnimalResponse,
              summary="Update animal details")
async def update_animal(
    animal_id: str, data: schemas.AnimalUpdate, db: AsyncSession = Depends(get_db)
):
    animal = await crud.update_animal(db, animal_id, data)
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found.")
    return animal


@router.post("/{animal_id}/archive", response_model=schemas.AnimalResponse,
             summary="Archive animal (mark as Deceased or Sold)")
async def archive_animal(
    animal_id: str,
    reason: str = Query("Deceased", description="Deceased | Sold"),
    db: AsyncSession = Depends(get_db),
):
    if reason not in ("Deceased", "Sold"):
        raise HTTPException(status_code=422, detail="reason must be 'Deceased' or 'Sold'.")
    animal = await crud.archive_animal(db, animal_id, reason)
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found.")
    return animal
