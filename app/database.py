"""
Database engine configuration and session management.
Uses SQLite with async support via aiosqlite.
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

# Database file location - stored alongside the application
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, '..', 'farm_records.db')}"


class Base(DeclarativeBase):
    pass


# Create async engine with WAL mode for better concurrent read performance
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set True for SQL debug logging
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db() -> AsyncSession:
    """FastAPI dependency: yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Create all tables on first startup."""
    async with engine.begin() as conn:
        # Enable WAL mode for SQLite performance
        await conn.exec_driver_sql("PRAGMA journal_mode=WAL;")
        await conn.exec_driver_sql("PRAGMA foreign_keys=ON;")
        await conn.exec_driver_sql("PRAGMA synchronous=NORMAL;")
        from app import models  # noqa – registers ORM metadata
        await conn.run_sync(Base.metadata.create_all)
