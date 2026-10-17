"""AI Adviser API Router"""
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app import models
from app.ai.adviser import MilkProductionAdviser
from app.ai.excel_exporter import generate_excel_report

router = APIRouter(prefix="/adviser", tags=["AI Adviser"])


async def _load_all_data(db: AsyncSession, start_date: date, end_date: date):
    """Helper to load all raw records for the adviser."""
    from datetime import datetime as dt
    from sqlalchemy import and_

    animals_r   = await db.execute(select(models.Animal))
    milk_r      = await db.execute(
        select(models.MilkProductionLog).where(
            models.MilkProductionLog.timestamp.between(
                dt.combine(start_date, dt.min.time()),
                dt.combine(end_date,   dt.max.time()),
            )
        )
    )
    health_r    = await db.execute(select(models.HealthRecord))
    feed_r      = await db.execute(select(models.FeedInventory))
    sales_r     = await db.execute(
        select(models.MilkSale).where(
            models.MilkSale.sale_date.between(start_date, end_date)
        )
    )
    expenses_r  = await db.execute(
        select(models.Expense).where(
            models.Expense.expense_date.between(start_date, end_date)
        )
    )

    def to_dicts(scalars):
        rows = scalars.scalars().all()
        if not rows:
            return []
        return [{c.name: getattr(obj, c.name) for c in obj.__table__.columns} for obj in rows]

    return (
        to_dicts(animals_r),
        to_dicts(milk_r),
        to_dicts(health_r),
        to_dicts(feed_r),
        to_dicts(sales_r),
        to_dicts(expenses_r),
    )


@router.get("/report", summary="📊 AI Milk Production Report (JSON)")
async def get_ai_report(
    period_days: int = Query(30, ge=7, le=365, description="Analysis window in days"),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns structured AI analysis:
    - Herd-level summary with declining animals & anomalies
    - Per-animal trend direction, slope, R², anomaly count
    - Causal insights: health / feed / seasonal correlation
    - Financial P&L overlay
    """
    end_date   = date.today()
    start_date = end_date - timedelta(days=period_days)

    animals, milk_logs, health, feed_inv, sales, expenses = await _load_all_data(
        db, start_date, end_date
    )

    adviser = MilkProductionAdviser(
        milk_logs=milk_logs,
        health_records=health,
        feed_inventory=feed_inv,
        animals=animals,
        milk_sales=sales,
        expenses=expenses,
    )
    report = adviser.analyze(period_days=period_days)

    # Serialize report to dict
    def serialize_report(r):
        from dataclasses import asdict
        import datetime
        def default(o):
            if isinstance(o, (datetime.date, datetime.datetime)):
                return o.isoformat()
            return str(o)
        import json
        return json.loads(json.dumps(asdict(r), default=default))

    return serialize_report(report)


@router.get("/export/excel", summary="📥 Export AI report as Excel workbook",
            response_class=Response)
async def export_excel(
    period_days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
):
    """
    Generates a multi-tab Excel file with:
    - Summary Dashboard (KPIs, alerts, rankings)
    - Per-animal production analysis table
    - Anomaly log with probable causes
    - Finance Overview (revenue vs expenses)
    - Embedded line charts per animal

    Returns the .xlsx file as a direct download.
    """
    end_date   = date.today()
    start_date = end_date - timedelta(days=period_days)

    animals, milk_logs, health, feed_inv, sales, expenses = await _load_all_data(
        db, start_date, end_date
    )

    adviser = MilkProductionAdviser(
        milk_logs=milk_logs,
        health_records=health,
        feed_inventory=feed_inv,
        animals=animals,
        milk_sales=sales,
        expenses=expenses,
    )
    report = adviser.analyze(period_days=period_days)
    excel_bytes = generate_excel_report(report)

    filename = f"farm_report_{start_date}_to_{end_date}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
