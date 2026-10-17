"""
CRUD (Create, Read, Update, Delete) operations.
All database logic lives here — routers stay thin.
"""
from __future__ import annotations
from datetime import datetime, date, timedelta
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, desc
from app import models, schemas


# ===========================================================================
# ANIMALS
# ===========================================================================
async def create_animal(db: AsyncSession, data: schemas.AnimalCreate) -> models.Animal:
    animal = models.Animal(**data.model_dump())
    db.add(animal)
    await db.commit()
    await db.refresh(animal)
    return animal


async def get_animal(db: AsyncSession, animal_id: str) -> Optional[models.Animal]:
    result = await db.execute(select(models.Animal).where(models.Animal.id == animal_id))
    return result.scalar_one_or_none()


async def get_animal_by_tag(db: AsyncSession, tag: str) -> Optional[models.Animal]:
    result = await db.execute(select(models.Animal).where(models.Animal.tag_number == tag))
    return result.scalar_one_or_none()


async def list_animals(
    db: AsyncSession,
    status: Optional[str] = "Active",
    skip: int = 0,
    limit: int = 200,
) -> List[models.Animal]:
    query = select(models.Animal)
    if status:
        query = query.where(models.Animal.status == status)
    query = query.offset(skip).limit(limit).order_by(models.Animal.tag_number)
    result = await db.execute(query)
    return result.scalars().all()


async def update_animal(
    db: AsyncSession, animal_id: str, data: schemas.AnimalUpdate
) -> Optional[models.Animal]:
    animal = await get_animal(db, animal_id)
    if not animal:
        return None
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(animal, field, value)
    await db.commit()
    await db.refresh(animal)
    return animal


async def archive_animal(
    db: AsyncSession, animal_id: str, reason: str = "Deceased"
) -> Optional[models.Animal]:
    """Mark animal as Deceased/Sold without deleting — preserves all linked records."""
    animal = await get_animal(db, animal_id)
    if not animal:
        return None
    animal.status = reason  # 'Deceased' | 'Sold'
    animal.archived_at = datetime.utcnow()
    await db.commit()
    await db.refresh(animal)
    return animal


# ===========================================================================
# MILK PRODUCTION LOGS
# ===========================================================================
async def log_milk_production(
    db: AsyncSession, data: schemas.MilkLogCreate
) -> models.MilkProductionLog:
    log = models.MilkProductionLog(**data.model_dump())
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log


async def bulk_log_milk(
    db: AsyncSession, entries: List[schemas.MilkLogCreate]
) -> List[models.MilkProductionLog]:
    logs = [models.MilkProductionLog(**e.model_dump()) for e in entries]
    db.add_all(logs)
    await db.commit()
    return logs


async def get_milk_history(
    db: AsyncSession,
    animal_id: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = 500,
) -> List[models.MilkProductionLog]:
    query = select(models.MilkProductionLog).where(
        models.MilkProductionLog.animal_id == animal_id
    )
    if start_date:
        query = query.where(models.MilkProductionLog.timestamp >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.where(models.MilkProductionLog.timestamp <= datetime.combine(end_date, datetime.max.time()))
    query = query.order_by(desc(models.MilkProductionLog.timestamp)).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


async def get_all_milk_logs_range(
    db: AsyncSession,
    start_date: date,
    end_date: date,
) -> List[models.MilkProductionLog]:
    query = (
        select(models.MilkProductionLog)
        .where(
            and_(
                models.MilkProductionLog.timestamp >= datetime.combine(start_date, datetime.min.time()),
                models.MilkProductionLog.timestamp <= datetime.combine(end_date, datetime.max.time()),
            )
        )
        .order_by(models.MilkProductionLog.timestamp)
    )
    result = await db.execute(query)
    return result.scalars().all()


# ===========================================================================
# MILK SALES
# ===========================================================================
async def create_milk_sale(
    db: AsyncSession, data: schemas.MilkSaleCreate
) -> models.MilkSale:
    total = round(data.volume_liters * data.price_per_liter, 2)
    sale = models.MilkSale(
        **data.model_dump(),
        total_amount=total,
    )
    db.add(sale)
    await db.commit()
    await db.refresh(sale)
    return sale


async def list_milk_sales(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> List[models.MilkSale]:
    query = select(models.MilkSale)
    if start_date:
        query = query.where(models.MilkSale.sale_date >= start_date)
    if end_date:
        query = query.where(models.MilkSale.sale_date <= end_date)
    result = await db.execute(query.order_by(desc(models.MilkSale.sale_date)))
    return result.scalars().all()


async def total_milk_revenue(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> float:
    query = select(func.sum(models.MilkSale.total_amount))
    if start_date:
        query = query.where(models.MilkSale.sale_date >= start_date)
    if end_date:
        query = query.where(models.MilkSale.sale_date <= end_date)
    result = await db.execute(query)
    return result.scalar_one_or_none() or 0.0


# ===========================================================================
# EXPENSES
# ===========================================================================
async def create_expense(db: AsyncSession, data: schemas.ExpenseCreate) -> models.Expense:
    expense = models.Expense(**data.model_dump())
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense


async def bulk_create_expenses(
    db: AsyncSession, entries: List[schemas.ExpenseCreate]
) -> List[models.Expense]:
    expenses = [models.Expense(**e.model_dump()) for e in entries]
    db.add_all(expenses)
    await db.commit()
    return expenses


async def list_expenses(
    db: AsyncSession,
    category: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> List[models.Expense]:
    query = select(models.Expense)
    if category:
        query = query.where(models.Expense.category == category)
    if start_date:
        query = query.where(models.Expense.expense_date >= start_date)
    if end_date:
        query = query.where(models.Expense.expense_date <= end_date)
    result = await db.execute(query.order_by(desc(models.Expense.expense_date)))
    return result.scalars().all()


async def expenses_by_category(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict:
    query = select(models.Expense.category, func.sum(models.Expense.amount).label("total"))
    if start_date:
        query = query.where(models.Expense.expense_date >= start_date)
    if end_date:
        query = query.where(models.Expense.expense_date <= end_date)
    query = query.group_by(models.Expense.category)
    result = await db.execute(query)
    return {row.category: round(row.total, 2) for row in result.all()}


# ===========================================================================
# HEALTH RECORDS
# ===========================================================================
async def create_health_record(
    db: AsyncSession, data: schemas.HealthRecordCreate
) -> models.HealthRecord:
    record = models.HealthRecord(**data.model_dump())
    db.add(record)
    # Update parent animal health_status
    animal = await get_animal(db, data.animal_id)
    if animal:
        animal.health_status = "Under Treatment"
    await db.commit()
    await db.refresh(record)
    return record


async def update_health_record(
    db: AsyncSession, record_id: str, data: schemas.HealthRecordUpdate
) -> Optional[models.HealthRecord]:
    result = await db.execute(
        select(models.HealthRecord).where(models.HealthRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        return None
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(record, field, value)
    # If recovered, update parent animal status
    if data.recovery_status == "Recovered":
        animal = await get_animal(db, record.animal_id)
        if animal:
            animal.health_status = "Healthy"
    await db.commit()
    await db.refresh(record)
    return record


async def get_active_health_issues(db: AsyncSession) -> List[models.HealthRecord]:
    result = await db.execute(
        select(models.HealthRecord).where(
            models.HealthRecord.recovery_status == "Under Treatment"
        )
    )
    return result.scalars().all()


# ===========================================================================
# FEEDING LOGS
# ===========================================================================
async def log_feeding(
    db: AsyncSession, data: schemas.FeedingLogCreate
) -> models.FeedingLog:
    log = models.FeedingLog(**data.model_dump())
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log


# ===========================================================================
# FEED INVENTORY
# ===========================================================================
async def list_feed_inventory(db: AsyncSession) -> List[models.FeedInventory]:
    result = await db.execute(select(models.FeedInventory))
    return result.scalars().all()


async def get_low_stock_alerts(db: AsyncSession) -> List[models.FeedInventory]:
    result = await db.execute(
        select(models.FeedInventory).where(
            models.FeedInventory.current_stock_kg <= models.FeedInventory.low_stock_threshold_kg
        )
    )
    return result.scalars().all()


async def upsert_feed_inventory(
    db: AsyncSession, data: schemas.FeedInventoryCreate
) -> models.FeedInventory:
    result = await db.execute(
        select(models.FeedInventory).where(models.FeedInventory.feed_name == data.feed_name)
    )
    inv = result.scalar_one_or_none()
    if inv:
        for field, val in data.model_dump(exclude_none=True).items():
            setattr(inv, field, val)
    else:
        inv = models.FeedInventory(**data.model_dump())
        db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv


# ===========================================================================
# REMINDERS
# ===========================================================================
async def get_all_reminders(db: AsyncSession) -> List[models.ReminderConfiguration]:
    result = await db.execute(select(models.ReminderConfiguration))
    return result.scalars().all()


async def upsert_reminder(
    db: AsyncSession, data: schemas.ReminderConfigCreate
) -> models.ReminderConfiguration:
    result = await db.execute(
        select(models.ReminderConfiguration).where(
            models.ReminderConfiguration.task_type == data.task_type
        )
    )
    reminder = result.scalar_one_or_none()
    if reminder:
        for field, val in data.model_dump(exclude_none=True).items():
            setattr(reminder, field, val)
    else:
        reminder = models.ReminderConfiguration(**data.model_dump())
        db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return reminder


async def mark_reminder_triggered(db: AsyncSession, task_type: str):
    result = await db.execute(
        select(models.ReminderConfiguration).where(
            models.ReminderConfiguration.task_type == task_type
        )
    )
    reminder = result.scalar_one_or_none()
    if reminder:
        reminder.last_triggered = datetime.utcnow()
        await db.commit()


# ===========================================================================
# FINANCE SUMMARY
# ===========================================================================
async def get_finance_summary(
    db: AsyncSession, start_date: date, end_date: date
) -> schemas.FinanceSummary:
    revenue = await total_milk_revenue(db, start_date, end_date)
    by_cat = await expenses_by_category(db, start_date, end_date)
    total_exp = round(sum(by_cat.values()), 2)
    top_cat = max(by_cat, key=by_cat.get) if by_cat else "N/A"

    # Revenue per liter sold
    liters_query = await db.execute(
        select(func.sum(models.MilkSale.volume_liters)).where(
            and_(
                models.MilkSale.sale_date >= start_date,
                models.MilkSale.sale_date <= end_date,
            )
        )
    )
    total_liters = liters_query.scalar_one_or_none() or 0.0
    rev_per_liter = round(revenue / total_liters, 4) if total_liters else None

    return schemas.FinanceSummary(
        period_start=start_date,
        period_end=end_date,
        total_milk_revenue=round(revenue, 2),
        total_expenses=total_exp,
        net_profit=round(revenue - total_exp, 2),
        expenses_by_category=by_cat,
        top_expense_category=top_cat,
        revenue_per_liter=rev_per_liter,
    )
