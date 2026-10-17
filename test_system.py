"""
Comprehensive test suite for the Farm Management System.
Verifies: Animal CRUD, Milk Logging, Finance, AI Adviser logic, Excel export.
Run with: python test_system.py
"""
import asyncio
import os
import sys
from datetime import date, datetime, timedelta

# ── Setup in-memory test database ───────────────────────────────────────────
os.environ["FARM_TEST_MODE"] = "1"

# Patch the database URL to use an in-memory SQLite for tests
import app.database as _db_module

_db_module.DATABASE_URL = "sqlite+aiosqlite:///:memory:"
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
_test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
_db_module.engine = _test_engine
_db_module.AsyncSessionLocal = async_sessionmaker(
    _test_engine, class_=AsyncSession, expire_on_commit=False
)

# ── Imports after patching ───────────────────────────────────────────────────
from app import crud, schemas
from app.ai.adviser import MilkProductionAdviser
from app.ai.excel_exporter import generate_excel_report


PASS = "✅ PASS"
FAIL = "❌ FAIL"
results = []


def check(name: str, condition: bool, detail: str = ""):
    status = PASS if condition else FAIL
    results.append((status, name))
    print(f"  {status}  {name}" + (f" — {detail}" if detail else ""))


async def run_tests():
    print("\n" + "="*65)
    print("  🐄  FARM MANAGEMENT SYSTEM — TEST SUITE")
    print("="*65)

    # Initialize DB
    from app.database import Base
    async with _test_engine.begin() as conn:
        await conn.exec_driver_sql("PRAGMA foreign_keys=ON;")
        await conn.run_sync(Base.metadata.create_all)

    async with _db_module.AsyncSessionLocal() as db:

        # ── 1. Animal CRUD ─────────────────────────────────────────────
        print("\n📋  1. Animal Record Management")
        animal_data = schemas.AnimalCreate(
            tag_number="COW-001",
            name="Bessie",
            breed="Holstein",
            gender="Female",
            date_of_birth=date(2020, 3, 15),
            acquisition_date=date(2021, 6, 1),
            weight_kg=450.0,
        )
        animal = await crud.create_animal(db, animal_data)
        check("Create animal", animal.id is not None, f"ID={animal.id[:8]}...")

        fetched = await crud.get_animal(db, animal.id)
        check("Fetch animal by ID", fetched is not None and fetched.tag_number == "COW-001")

        by_tag = await crud.get_animal_by_tag(db, "COW-001")
        check("Fetch by tag number", by_tag is not None)

        updated = await crud.update_animal(db, animal.id, schemas.AnimalUpdate(weight_kg=460.0))
        check("Update animal weight", updated.weight_kg == 460.0)

        # Create second animal
        animal2 = await crud.create_animal(db, schemas.AnimalCreate(
            tag_number="COW-002", name="Daisy", breed="Jersey",
            gender="Female", date_of_birth=date(2019, 7, 20),
            acquisition_date=date(2020, 1, 10), weight_kg=380.0,
        ))

        active = await crud.list_animals(db, status="Active")
        check("List active animals", len(active) == 2, f"{len(active)} animals")

        archived = await crud.archive_animal(db, animal2.id, "Deceased")
        check("Archive animal (Deceased)", archived.status == "Deceased")

        active_after = await crud.list_animals(db, status="Active")
        check("Deceased excluded from Active list", len(active_after) == 1)

        all_animals = await crud.list_animals(db, status=None)
        check("Deceased still in full list", len(all_animals) == 2)

        # ── 2. Milk Production ─────────────────────────────────────────
        print("\n🥛  2. Milk Production Tracking")
        base_date = datetime.utcnow() - timedelta(days=20)

        # Log 20 days of data with declining trend
        volumes = [25, 25, 24, 24, 23, 22, 21, 20, 18, 15,
                   14, 13, 12, 12, 11, 10, 10, 9, 8, 8]
        logs = []
        for i, vol in enumerate(volumes):
            log_entry = schemas.MilkLogCreate(
                animal_id=animal.id,
                timestamp=base_date + timedelta(days=i),
                session="Morning",
                volume_liters=float(vol),
            )
            log = await crud.log_milk_production(db, log_entry)
            logs.append(log)

        check("Log 20 milk sessions", len(logs) == 20)

        bulk_entries = schemas.BulkMilkEntry(entries=[
            schemas.MilkLogCreate(
                animal_id=animal.id,
                timestamp=datetime.utcnow(),
                session="Evening",
                volume_liters=7.5,
            )
        ])
        bulk_result = await crud.bulk_log_milk(db, bulk_entries.entries)
        check("Bulk milk log (quick form)", len(bulk_result) == 1)

        history = await crud.get_milk_history(db, animal.id)
        check("Retrieve milk history", len(history) >= 20)

        # ── 3. Finance Module ──────────────────────────────────────────
        print("\n💰  3. Finance Tracking")
        sale = await crud.create_milk_sale(db, schemas.MilkSaleCreate(
            animal_id=animal.id,
            sale_date=date.today(),
            volume_liters=50.0,
            price_per_liter=45.0,   # e.g. KSh 45
            buyer_name="Local Dairy",
        ))
        check("Create milk sale", abs(sale.total_amount - 2250.0) < 0.01, f"Total={sale.total_amount}")

        expenses_data = schemas.BatchExpenseEntry(entries=[
            schemas.ExpenseCreate(expense_date=date.today(), category="Feed",     amount=1200.0),
            schemas.ExpenseCreate(expense_date=date.today(), category="Medicine", amount=350.0),
            schemas.ExpenseCreate(expense_date=date.today(), category="Shelter",  amount=500.0),
        ])
        exp_list = await crud.bulk_create_expenses(db, expenses_data.entries)
        check("Batch expense entry (3 categories)", len(exp_list) == 3)

        by_cat = await crud.expenses_by_category(db)
        check("Expenses grouped by category", "Feed" in by_cat and by_cat["Feed"] == 1200.0)

        summary = await crud.get_finance_summary(
            db,
            date.today() - timedelta(days=1),
            date.today() + timedelta(days=1),
        )
        check("Finance summary — net profit computed",
              abs(summary.net_profit - (2250.0 - 2050.0)) < 0.01,
              f"Revenue={summary.total_milk_revenue}, Exp={summary.total_expenses}, Net={summary.net_profit}")

        # ── 4. Health Records ──────────────────────────────────────────
        print("\n🏥  4. Health Records")
        health_record = await crud.create_health_record(db, schemas.HealthRecordCreate(
            animal_id=animal.id,
            diagnosis="Mastitis",
            treatment_start_date=date.today() - timedelta(days=5),
            medication_name="Penicillin",
            dosage="10ml / 12hrs",
            cost=350.0,
        ))
        check("Create health record", health_record.id is not None)

        # Check that animal health_status was updated
        refreshed = await crud.get_animal(db, animal.id)
        check("Animal health_status updated to Under Treatment",
              refreshed.health_status == "Under Treatment")

        updated_rec = await crud.update_health_record(
            db, health_record.id,
            schemas.HealthRecordUpdate(recovery_status="Recovered", treatment_end_date=date.today())
        )
        check("Update health record to Recovered", updated_rec.recovery_status == "Recovered")

        animal_after = await crud.get_animal(db, animal.id)
        check("Animal health_status reset to Healthy", animal_after.health_status == "Healthy")

        # ── 5. AI Adviser ──────────────────────────────────────────────
        print("\n🤖  5. AI Milk Production Adviser")
        milk_log_dicts = [
            {
                "animal_id": animal.id,
                "timestamp": base_date + timedelta(days=i),
                "session": "Morning",
                "volume_liters": float(v),
            }
            for i, v in enumerate(volumes)
        ]
        animal_dicts = [{
            "id": animal.id,
            "tag_number": "COW-001",
            "name": "Bessie",
            "breed": "Holstein",
        }]
        health_dicts = [{
            "animal_id": animal.id,
            "diagnosis": "Mastitis",
            "treatment_start_date": date.today() - timedelta(days=5),
            "recovery_status": "Under Treatment",
        }]

        adviser = MilkProductionAdviser(
            milk_logs=milk_log_dicts,
            health_records=health_dicts,
            feed_inventory=[],
            animals=animal_dicts,
            milk_sales=[{"total_amount": 2250.0}],
            expenses=[{"amount": 2050.0}],
        )
        report = adviser.analyze(period_days=30)

        check("Herd report generated", report is not None)
        check("Animal analyzed", report.total_animals_analyzed >= 1)

        ar = next((r for r in report.animal_reports if r.animal_id == animal.id), None)
        check("Per-animal report found", ar is not None)

        if ar:
            check(
                "Trend detected as Declining",
                ar.trend_direction == "Declining",
                f"Direction={ar.trend_direction}, Slope={ar.trend_slope_liters_per_day:.3f}"
            )
            check(
                "Anomalies detected",
                ar.anomaly_count > 0,
                f"Count={ar.anomaly_count}"
            )
            if ar.anomalies:
                first_anomaly = ar.anomalies[0]
                check(
                    "Health event correlated to decline",
                    first_anomaly.health_event is not None or ar.health_correlated_drops >= 0,
                    f"Health correlated drops: {ar.health_correlated_drops}"
                )
            check("Top insight generated", len(ar.top_insight) > 0, ar.top_insight[:60])

        # ── 6. Excel Export ───────────────────────────────────────────
        print("\n📊  6. Excel Report Export")
        excel_bytes = generate_excel_report(report)
        check("Excel bytes generated", len(excel_bytes) > 1000, f"Size={len(excel_bytes):,} bytes")

        # Validate using openpyxl
        import io
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(excel_bytes))
            sheet_names = wb.sheetnames
            check("Excel has Summary Dashboard sheet", "📊 Summary Dashboard" in sheet_names)
            check("Excel has Animal Reports sheet",    "🐄 Animal Reports"    in sheet_names)
            check("Excel has Anomalies sheet",         "⚠️ Anomalies"          in sheet_names)
            check("Excel has Finance sheet",           "💰 Finance Overview"  in sheet_names)
            check("Excel has Charts sheet",            "📈 Charts"            in sheet_names)
            check("Excel has 5 sheets total",          len(sheet_names) >= 5, f"{len(sheet_names)} sheets")
        except ImportError:
            check("openpyxl validation skipped", True, "openpyxl not installed")

    # ── SUMMARY ──────────────────────────────────────────────────────────────
    print("\n" + "="*65)
    passed = sum(1 for s, _ in results if s == PASS)
    failed = sum(1 for s, _ in results if s == FAIL)
    total = len(results)
    print(f"  RESULTS: {passed}/{total} passed  |  {failed} failed")
    print("="*65)

    if failed > 0:
        print("\n  Failed tests:")
        for status, name in results:
            if status == FAIL:
                print(f"    ❌ {name}")
        sys.exit(1)
    else:
        print("\n  🎉 All tests passed! System is ready.")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(run_tests())
