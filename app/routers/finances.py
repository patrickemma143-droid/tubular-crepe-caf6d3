"""Finance & Expense Management API Router — Revenue + Expenses"""
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app import crud, schemas

router = APIRouter(prefix="/finances", tags=["Finances"])


# ── MILK SALES (Revenue) ────────────────────────────────────────────────────

@router.post("/sales", response_model=schemas.MilkSaleResponse, status_code=201,
             summary="Record a milk sale (auto-computes revenue)")
async def record_milk_sale(data: schemas.MilkSaleCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create_milk_sale(db, data)


@router.get("/sales", response_model=List[schemas.MilkSaleResponse],
            summary="List milk sales with optional date filter")
async def list_milk_sales(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
):
    return await crud.list_milk_sales(db, start_date, end_date)


# ── EXPENSES ────────────────────────────────────────────────────────────────

@router.post("/expenses", response_model=schemas.ExpenseResponse, status_code=201,
             summary="Log a single expense")
async def log_expense(data: schemas.ExpenseCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create_expense(db, data)


@router.post("/expenses/batch", response_model=List[schemas.ExpenseResponse], status_code=201,
             summary="📋 Single-click expense form — submit multiple categories at once")
async def batch_log_expenses(
    payload: schemas.BatchExpenseEntry, db: AsyncSession = Depends(get_db)
):
    """
    The frontend renders one form with rows for Feed, Medicine, Shelter,
    Labour, Equipment, etc. The manager fills in amounts and clicks Submit Once.
    All expense categories are persisted in a single API call.
    """
    return await crud.bulk_create_expenses(db, payload.entries)


@router.get("/expenses", response_model=List[schemas.ExpenseResponse],
            summary="List expenses with category and date filters")
async def list_expenses(
    category: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
):
    return await crud.list_expenses(db, category, start_date, end_date)


@router.get("/expenses/by-category",
            summary="Expense totals grouped by category")
async def expenses_by_category(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
):
    return await crud.expenses_by_category(db, start_date, end_date)


# ── SUMMARY ─────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=schemas.FinanceSummary,
            summary="Financial P&L summary for a date range")
async def finance_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns total milk revenue, all expense categories, net profit/loss,
    and the top expense category for the selected period.
    """
    return await crud.get_finance_summary(db, start_date, end_date)
