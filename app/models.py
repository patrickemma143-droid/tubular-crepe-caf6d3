"""
SQLAlchemy ORM models — core data models for the Farm Management System.
Tables: animals, milk_production_logs, health_records, feeding_logs,
        feed_inventory, milk_sales, expenses, reminder_configurations
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Float, Integer, Boolean, DateTime,
    Date, Text, ForeignKey, Index, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from app.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# ANIMALS
# ---------------------------------------------------------------------------
class Animal(Base):
    __tablename__ = "animals"

    id              = Column(String, primary_key=True, default=new_uuid)
    tag_number      = Column(String, unique=True, nullable=False, index=True)
    name            = Column(String, nullable=True)
    breed           = Column(String, nullable=False)
    gender          = Column(SAEnum("Female", "Male", name="gender_enum"), nullable=False, default="Female")
    date_of_birth   = Column(Date, nullable=False)
    acquisition_date= Column(Date, nullable=False)
    weight_kg       = Column(Float, nullable=True)

    # Status: 'Active' | 'Deceased' | 'Sold' | 'Archived'
    status          = Column(String, nullable=False, default="Active", index=True)
    archived_at     = Column(DateTime, nullable=True)

    # Quick health indicator updated by health_records
    health_status   = Column(String, nullable=False, default="Healthy")  # Healthy | Sick | Under Treatment

    # Optional notes about the animal
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    # Relationships
    milk_logs    = relationship("MilkProductionLog", back_populates="animal", cascade="all, delete-orphan")
    health_records = relationship("HealthRecord",    back_populates="animal", cascade="all, delete-orphan")
    feeding_logs = relationship("FeedingLog",        back_populates="animal", cascade="all, delete-orphan")
    milk_sales   = relationship("MilkSale",          back_populates="animal", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# MILK PRODUCTION LOGS  (time-series)
# ---------------------------------------------------------------------------
class MilkProductionLog(Base):
    __tablename__ = "milk_production_logs"

    id                  = Column(String, primary_key=True, default=new_uuid)
    animal_id           = Column(String, ForeignKey("animals.id", ondelete="CASCADE"), nullable=False)
    timestamp           = Column(DateTime, nullable=False, default=datetime.utcnow)
    session             = Column(String, nullable=False, default="Morning")   # Morning | Evening | Midday
    volume_liters       = Column(Float, nullable=False)
    fat_percentage      = Column(Float, nullable=True)
    protein_percentage  = Column(Float, nullable=True)
    somatic_cell_count  = Column(Integer, nullable=True)  # High → possible mastitis
    notes               = Column(Text, nullable=True)

    animal = relationship("Animal", back_populates="milk_logs")

    __table_args__ = (
        # Fast time-series queries: filter by cow + date range
        Index("idx_prod_animal_time", "animal_id", "timestamp"),
        Index("idx_prod_time",        "timestamp"),
    )


# ---------------------------------------------------------------------------
# MILK SALES (Revenue per batch sold)
# ---------------------------------------------------------------------------
class MilkSale(Base):
    __tablename__ = "milk_sales"

    id              = Column(String, primary_key=True, default=new_uuid)
    animal_id       = Column(String, ForeignKey("animals.id", ondelete="CASCADE"), nullable=True)
    sale_date       = Column(Date, nullable=False)
    volume_liters   = Column(Float, nullable=False)
    price_per_liter = Column(Float, nullable=False)
    total_amount    = Column(Float, nullable=False)   # computed: volume × price
    buyer_name      = Column(String, nullable=True)
    payment_method  = Column(String, nullable=True)   # Cash | Mobile Money | Bank Transfer
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    animal = relationship("Animal", back_populates="milk_sales")

    __table_args__ = (
        Index("idx_sale_date", "sale_date"),
    )


# ---------------------------------------------------------------------------
# EXPENSES
# ---------------------------------------------------------------------------
class Expense(Base):
    __tablename__ = "expenses"

    id              = Column(String, primary_key=True, default=new_uuid)
    expense_date    = Column(Date, nullable=False)
    category        = Column(String, nullable=False)  # Feed | Medicine | Shelter | Labour | Equipment | Other
    description     = Column(Text, nullable=True)
    amount          = Column(Float, nullable=False)
    vendor          = Column(String, nullable=True)
    payment_method  = Column(String, nullable=True)
    receipt_number  = Column(String, nullable=True)
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_expense_date", "expense_date"),
        Index("idx_expense_category", "category"),
    )


# ---------------------------------------------------------------------------
# HEALTH RECORDS
# ---------------------------------------------------------------------------
class HealthRecord(Base):
    __tablename__ = "health_records"

    id                    = Column(String, primary_key=True, default=new_uuid)
    animal_id             = Column(String, ForeignKey("animals.id", ondelete="CASCADE"), nullable=False)
    diagnosis             = Column(String, nullable=False)
    treatment_start_date  = Column(Date, nullable=False)
    treatment_end_date    = Column(Date, nullable=True)
    medication_name       = Column(String, nullable=True)
    dosage                = Column(String, nullable=True)
    recovery_status       = Column(String, nullable=False, default="Under Treatment")
    vet_name              = Column(String, nullable=True)
    vet_notes             = Column(Text, nullable=True)
    cost                  = Column(Float, nullable=True)   # Veterinary cost
    created_at            = Column(DateTime, default=datetime.utcnow)

    animal = relationship("Animal", back_populates="health_records")

    __table_args__ = (
        Index("idx_health_animal", "animal_id"),
        Index("idx_health_status", "recovery_status"),
    )


# ---------------------------------------------------------------------------
# FEEDING LOGS
# ---------------------------------------------------------------------------
class FeedingLog(Base):
    __tablename__ = "feeding_logs"

    id          = Column(String, primary_key=True, default=new_uuid)
    animal_id   = Column(String, ForeignKey("animals.id", ondelete="SET NULL"), nullable=True)
    feed_type   = Column(String, nullable=False)
    quantity_kg = Column(Float, nullable=False)
    timestamp   = Column(DateTime, nullable=False, default=datetime.utcnow)
    notes       = Column(Text, nullable=True)

    animal = relationship("Animal", back_populates="feeding_logs")

    __table_args__ = (
        Index("idx_feed_animal_time", "animal_id", "timestamp"),
    )


# ---------------------------------------------------------------------------
# FEED INVENTORY
# ---------------------------------------------------------------------------
class FeedInventory(Base):
    __tablename__ = "feed_inventory"

    id                     = Column(String, primary_key=True, default=new_uuid)
    feed_name              = Column(String, unique=True, nullable=False)
    current_stock_kg       = Column(Float, nullable=False, default=0.0)
    low_stock_threshold_kg = Column(Float, nullable=False, default=50.0)
    unit_cost_per_kg       = Column(Float, nullable=True)
    updated_at             = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# REMINDER CONFIGURATIONS
# ---------------------------------------------------------------------------
class ReminderConfiguration(Base):
    __tablename__ = "reminder_configurations"

    id             = Column(String, primary_key=True, default=new_uuid)
    task_type      = Column(String, unique=True, nullable=False)   # 'Daily Milk', 'Animal Health', 'Feed Check', 'Medication Due'
    label          = Column(String, nullable=False)
    scheduled_time = Column(String, nullable=False, default="06:00")   # HH:MM local time
    is_enabled     = Column(Boolean, nullable=False, default=True)
    last_triggered = Column(DateTime, nullable=True)
    message        = Column(Text, nullable=True)
