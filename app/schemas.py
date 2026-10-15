"""
Pydantic schemas for request validation and response serialization.
Organized by domain: Animals, MilkProduction, MilkSales, Expenses,
HealthRecords, FeedingLogs, FeedInventory, Reminders.
"""
from __future__ import annotations
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, model_validator


# ===========================================================================
# ANIMALS
# ===========================================================================
class AnimalBase(BaseModel):
    tag_number: str = Field(..., min_length=1, max_length=50, description="Unique ear-tag number")
    name: Optional[str] = None
    breed: str = Field(..., min_length=1)
    gender: str = Field(default="Female")
    date_of_birth: date
    acquisition_date: date
    weight_kg: Optional[float] = Field(default=None, gt=0)
    notes: Optional[str] = None

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v):
        if v not in ("Male", "Female"):
            raise ValueError("gender must be 'Male' or 'Female'")
        return v


class AnimalCreate(AnimalBase):
    pass


class AnimalUpdate(BaseModel):
    name: Optional[str] = None
    breed: Optional[str] = None
    weight_kg: Optional[float] = None
    health_status: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("health_status")
    @classmethod
    def validate_health(cls, v):
        if v and v not in ("Healthy", "Sick", "Under Treatment"):
            raise ValueError("health_status must be Healthy | Sick | Under Treatment")
        return v


class AnimalResponse(AnimalBase):
    id: str
    status: str
    health_status: str
    archived_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ===========================================================================
# MILK PRODUCTION
# ===========================================================================
class MilkLogBase(BaseModel):
    animal_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    session: str = Field(default="Morning")
    volume_liters: float = Field(..., gt=0, le=200)
    fat_percentage: Optional[float] = Field(default=None, ge=0, le=15)
    protein_percentage: Optional[float] = Field(default=None, ge=0, le=10)
    somatic_cell_count: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None

    @field_validator("session")
    @classmethod
    def validate_session(cls, v):
        if v not in ("Morning", "Evening", "Midday"):
            raise ValueError("session must be Morning | Evening | Midday")
        return v


class MilkLogCreate(MilkLogBase):
    pass


class MilkLogResponse(MilkLogBase):
    id: str
    model_config = {"from_attributes": True}


# Bulk entry for "quick daily entry" form (multiple animals in one submit)
class BulkMilkEntry(BaseModel):
    entries: List[MilkLogCreate]


# ===========================================================================
# MILK SALES (Revenue)
# ===========================================================================
class MilkSaleBase(BaseModel):
    animal_id: Optional[str] = None
    sale_date: date
    volume_liters: float = Field(..., gt=0)
    price_per_liter: float = Field(..., gt=0)
    buyer_name: Optional[str] = None
    payment_method: Optional[str] = Field(default="Cash")
    notes: Optional[str] = None

    @model_validator(mode="after")
    def compute_total(self) -> "MilkSaleBase":
        # total_amount is computed automatically; not required in input
        return self


class MilkSaleCreate(MilkSaleBase):
    pass


class MilkSaleResponse(MilkSaleBase):
    id: str
    total_amount: float
    created_at: datetime
    model_config = {"from_attributes": True}


# ===========================================================================
# EXPENSES (Single-click form — all categories)
# ===========================================================================

EXPENSE_CATEGORIES = [
    "Feed", "Medicine", "Shelter", "Labour",
    "Equipment", "Veterinary", "Transport", "Utilities", "Other"
]


class ExpenseBase(BaseModel):
    expense_date: date
    category: str
    description: Optional[str] = None
    amount: float = Field(..., gt=0)
    vendor: Optional[str] = None
    payment_method: Optional[str] = Field(default="Cash")
    receipt_number: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v):
        if v not in EXPENSE_CATEGORIES:
            raise ValueError(f"category must be one of: {EXPENSE_CATEGORIES}")
        return v

    @field_validator("payment_method")
    @classmethod
    def validate_payment(cls, v):
        if v and v not in ("Cash", "Mobile Money", "Bank Transfer", "Cheque"):
            raise ValueError("Invalid payment method")
        return v


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseResponse(ExpenseBase):
    id: str
    created_at: datetime
    model_config = {"from_attributes": True}


# Batch expense submission (single-click multi-category form)
class BatchExpenseEntry(BaseModel):
    entries: List[ExpenseCreate]


# ===========================================================================
# HEALTH RECORDS
# ===========================================================================
class HealthRecordBase(BaseModel):
    animal_id: str
    diagnosis: str = Field(..., min_length=2)
    treatment_start_date: date
    treatment_end_date: Optional[date] = None
    medication_name: Optional[str] = None
    dosage: Optional[str] = None
    recovery_status: str = Field(default="Under Treatment")
    vet_name: Optional[str] = None
    vet_notes: Optional[str] = None
    cost: Optional[float] = Field(default=None, ge=0)

    @field_validator("recovery_status")
    @classmethod
    def validate_recovery(cls, v):
        if v not in ("Under Treatment", "Recovered", "Chronic", "Deceased"):
            raise ValueError("Invalid recovery_status")
        return v


class HealthRecordCreate(HealthRecordBase):
    pass


class HealthRecordUpdate(BaseModel):
    treatment_end_date: Optional[date] = None
    medication_name: Optional[str] = None
    dosage: Optional[str] = None
    recovery_status: Optional[str] = None
    vet_notes: Optional[str] = None
    cost: Optional[float] = None


class HealthRecordResponse(HealthRecordBase):
    id: str
    created_at: datetime
    model_config = {"from_attributes": True}


# ===========================================================================
# FEEDING LOGS
# ===========================================================================
class FeedingLogCreate(BaseModel):
    animal_id: Optional[str] = None
    feed_type: str
    quantity_kg: float = Field(..., gt=0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None


class FeedingLogResponse(FeedingLogCreate):
    id: str
    model_config = {"from_attributes": True}


# ===========================================================================
# FEED INVENTORY
# ===========================================================================
class FeedInventoryCreate(BaseModel):
    feed_name: str
    current_stock_kg: float = Field(..., ge=0)
    low_stock_threshold_kg: float = Field(default=50.0, ge=0)
    unit_cost_per_kg: Optional[float] = None


class FeedInventoryUpdate(BaseModel):
    current_stock_kg: Optional[float] = None
    low_stock_threshold_kg: Optional[float] = None
    unit_cost_per_kg: Optional[float] = None


class FeedInventoryResponse(FeedInventoryCreate):
    id: str
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


# ===========================================================================
# REMINDERS
# ===========================================================================
class ReminderConfigCreate(BaseModel):
    task_type: str
    label: str
    scheduled_time: str = Field(default="06:00", pattern=r"^\d{2}:\d{2}$")
    is_enabled: bool = True
    message: Optional[str] = None


class ReminderConfigUpdate(BaseModel):
    scheduled_time: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    is_enabled: Optional[bool] = None
    message: Optional[str] = None


class ReminderConfigResponse(ReminderConfigCreate):
    id: str
    last_triggered: Optional[datetime] = None
    model_config = {"from_attributes": True}


# ===========================================================================
# FINANCE SUMMARY
# ===========================================================================
class FinanceSummary(BaseModel):
    period_start: date
    period_end: date
    total_milk_revenue: float
    total_expenses: float
    net_profit: float
    expenses_by_category: dict
    top_expense_category: str
    revenue_per_liter: Optional[float] = None
