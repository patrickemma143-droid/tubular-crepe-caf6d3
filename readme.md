# 🐄 Farm Management Operating System — MVP Backend

A **production-ready, offline-first** farm management backend built with **FastAPI + SQLite + AI Analytics**.

---

## 🗂 Project Structure

```
farm_management_system/
├── app/
│   ├── main.py              # FastAPI app, lifespan, startup logic
│   ├── database.py          # Async SQLite engine + session factory
│   ├── models.py            # SQLAlchemy ORM models (all tables)
│   ├── schemas.py           # Pydantic validation schemas
│   ├── crud.py              # All database operations
│   ├── scheduler.py         # APScheduler — daily reminder engine
│   ├── routers/
│   │   ├── animals.py       # Animal CRUD + archive
│   │   ├── production.py    # Milk logging + bulk daily entry
│   │   ├── finances.py      # Revenue (milk sales) + Expenses
│   │   ├── health.py        # Health records + treatment tracking
│   │   ├── reminders.py     # Reminder config + WebSocket push
│   │   └── adviser.py       # AI report + Excel export
│   └── ai/
│       ├── adviser.py       # AI analytics engine (trends, anomalies, causes)
│       └── excel_exporter.py# Multi-tab Excel workbook generator
├── requirements.txt
├── run.py                   # Start server
├── test_system.py           # Full test suite
└── farm_records.db          # SQLite database (auto-created on first run)
```

---

## 🚀 Quick Start

```bash
# 1. Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate          # macOS / Linux
venv\Scripts\activate             # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the server
python run.py
# → API available at: http://127.0.0.1:8000
# → Swagger docs at:  http://127.0.0.1:8000/docs

# 4. Run the full test suite
python test_system.py
```

---

## 📡 API Modules

### 🐄 Animal Records — `/animals`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/animals/` | Register new animal |
| `GET` | `/animals/?status=Active` | List animals (filter by status) |
| `GET` | `/animals/{id}` | Get single animal |
| `PATCH` | `/animals/{id}` | Update animal details |
| `POST` | `/animals/{id}/archive?reason=Deceased` | Archive animal (Deceased / Sold) |

**Archiving** marks animals as inactive without deleting any data. Full history (milk logs, health records) is preserved and queryable.

---

### 🥛 Milk Production — `/production`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/production/log` | Log a single milking session |
| `POST` | `/production/bulk-log` | **Quick Daily Entry** — all cows in one submit |
| `GET` | `/production/{id}/history` | Date-range production history per cow |

**Quick Daily Entry Form** — the frontend sends one JSON body with all cows' morning milk data. Backend validates and persists all entries atomically.

---

### 💰 Finances — `/finances`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/finances/sales` | Record milk sale (auto-computes revenue) |
| `GET` | `/finances/sales` | List sales with date filter |
| `POST` | `/finances/expenses` | Log single expense |
| `POST` | `/finances/expenses/batch` | **Single-click expense form** (all categories) |
| `GET` | `/finances/expenses` | List expenses by category + date |
| `GET` | `/finances/expenses/by-category` | Totals grouped by category |
| `GET` | `/finances/summary?start_date=&end_date=` | Full P&L summary |

**Expense Categories**: Feed · Medicine · Shelter · Labour · Equipment · Veterinary · Transport · Utilities · Other

---

### 🏥 Animal Health — `/health`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/health/` | Create health/treatment record |
| `PATCH` | `/health/{id}` | Update treatment status |
| `GET` | `/health/active` | All animals currently under treatment |

When a health record is created, the parent animal's `health_status` is automatically set to `"Under Treatment"`. When marked `"Recovered"`, it resets to `"Healthy"`.

---

### ⏰ Reminders — `/reminders`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/reminders/` | List all reminder configs |
| `POST` | `/reminders/` | Create/update a reminder |
| `PATCH` | `/reminders/{id}` | Update time or toggle on/off |
| `WS` | `/reminders/ws/notifications` | **WebSocket** — live push notifications |

**Default Reminders** (auto-seeded on first boot):

| Task | Default Time |
|------|-------------|
| 🥛 Morning Milk Recording | **05:30** |
| 🌙 Evening Milk Recording | **17:00** |
| 🏥 Daily Animal Health Check | **07:00** |
| 🌾 Feed Inventory Review | **08:00** |
| 💊 Medication & Treatment Check | **09:00** |

Times are configurable via the API or the frontend settings panel. The frontend connects to `/reminders/ws/notifications` and receives JSON push messages which it renders as desktop notification banners.

---

### 🤖 AI Adviser — `/adviser`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/adviser/report?period_days=30` | Full AI analysis (JSON) |
| `GET` | `/adviser/export/excel?period_days=30` | Download Excel workbook |

#### What the AI Adviser analyzes:

1. **Trend Detection** — Linear regression per cow over the analysis window. Classifies as: `Improving` / `Stable` / `Declining`
2. **Anomaly Detection** — Z-score flagging: sessions deviating >2σ from the cow's 7-day rolling average
3. **Causal Correlation** — For each anomaly, checks:
   - Was there a health event (diagnosis) within 5 days before the drop?
   - Is any feed stock currently below the low-stock threshold?
   - Does the date fall in a historically low production month?
4. **Smart Insights** — One-line actionable recommendation per animal
5. **Financial Overlay** — Revenue, expenses, and net profit for the period

#### Excel Export Tabs:

| Tab | Content |
|-----|---------|
| 📊 Summary Dashboard | KPI cards, active alerts, herd rankings, net profit |
| 🐄 Animal Reports | Per-animal stats with color-coded trend status |
| ⚠️ Anomalies | Every anomaly with drop %, z-score, and probable cause |
| 💰 Finance Overview | Revenue vs expenses breakdown |
| 📈 Charts | Embedded line charts per animal (yield trend + forecast) |

---

## 🗄 Database Schema

All data is stored in `farm_records.db` (SQLite) alongside the application.

| Table | Purpose | Key Index |
|-------|---------|-----------|
| `animals` | Core animal profiles + archive status | `status`, `tag_number` |
| `milk_production_logs` | Time-series daily milk sessions | `(animal_id, timestamp)` |
| `milk_sales` | Revenue entries per sale batch | `sale_date` |
| `expenses` | Spending by category | `expense_date`, `category` |
| `health_records` | Diagnoses + treatment history | `animal_id`, `recovery_status` |
| `feeding_logs` | Daily feed quantities | `(animal_id, timestamp)` |
| `feed_inventory` | Stock levels + low-stock thresholds | — |
| `reminder_configurations` | Cron schedules for notifications | `task_type` |

---

## 🔌 Frontend Integration

Connect a **React/Next.js** frontend (locally or in Electron) to `http://127.0.0.1:8000`.

### Quick Entry Form (Recommended UX)

The **"Record Today's Milking"** button on the dashboard should:
1. Fetch active cows: `GET /animals/?status=Active`
2. Render one row per cow with a volume input field
3. On click **Submit**: `POST /production/bulk-log` with all entries in one request

Similarly, the **"Log Today's Expenses"** form:
1. Render one row per expense category (Feed, Medicine, Shelter, etc.)
2. On click **Submit**: `POST /finances/expenses/batch`

### Reminder Notifications

```javascript
const ws = new WebSocket("ws://127.0.0.1:8000/reminders/ws/notifications");
ws.onmessage = (event) => {
  const { title, body, action } = JSON.parse(event.data);
  // Show OS-native or in-app notification
  new Notification(title, { body });
};
```

---

## 📦 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| API | FastAPI | Fast, async, auto-docs, type-safe |
| Database | SQLite + aiosqlite | Offline, zero-config, single file |
| ORM | SQLAlchemy 2.0 async | Type-safe, composable queries |
| Validation | Pydantic v2 | Fast, strict field validation |
| Analytics | Pandas + NumPy + Scipy | Offline trend analysis & statistics |
| Excel | XlsxWriter | Native Excel charts, rich formatting |
| Scheduler | APScheduler | In-process cron, no external services |
| Notifications | WebSocket | Real-time push to Electron/browser |
