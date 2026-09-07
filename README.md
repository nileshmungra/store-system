# 🏭 Bhumi Factory & Dispatch Manager

A full-stack inventory management system built for factory operations — tracking raw material inward, production output, and dispatch planning with QR code scanning.

## Features

| Module | Description |
|--------|-------------|
| **Inward** | Record material receipts with auto box generation & QR code labeling |
| **Production** | Log machine production output (coil weight, pipe length, operator) |
| **Outward** | Issue materials via QR scan or FIFO dispatch with DP plan integration |
| **Dispatch Plans** | Create/edit delivery plans with DP number, SO number, vehicle info, and item quantities |
| **BOM** | Define Bill of Materials for finished goods (component → finished good mapping) |
| **Reports** | End-to-end summary: inward vs dispatched variance, fulfillment rates, non-DP outward breakdown |
| **Audit Log** | Full activity trail of all actions (inward, outward, item changes, etc.) |
| **QR Scanner** | Mobile-friendly web scanner for box-level dispatch & outward processing |
| **Theme** | Dark/light mode toggle with persistence |

## Tech Stack

- **Backend:** FastAPI + Uvicorn + MySQL (SQLite fallback)
- **Frontend:** Vanilla HTML + Bootstrap 5 + Chart.js + QR Code.js + html5-qrcode
- **Deployment:** Railway (MySQL plugin, auto-provisioned)

## Quick Start

```bash
# 1. Clone & install
git clone https://github.com/YOUR_USERNAME/store-system.git
cd store-system
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt

# 2. Set up environment
cp .env.example .env
# Edit .env with your MySQL credentials

# 3. Run locally
python start_tunnels.py
# Or: uvicorn main:app --reload --port 8000
```

## Project Structure

```
store-system/
├── main.py              # FastAPI backend (all API + routes)
├── database.py          # MySQL connection pool + schema init
├── migrate_data.py      # SQLite → MySQL migration
├── start_local.bat      # Windows HTTPS server launcher
├── start_tunnels.py     # Cloudflare tunnel + uvicorn launcher
├── test_app.py          # pytest unit tests
├── requirements.txt     # Runtime dependencies
├── requirements-dev.txt # Test dependencies
├── runtime.txt          # Python version (Railway)
├── railway.toml         # Railway build config
├── Procfile             # Railway start command
├── .env.example         # Environment variables template
├── AGENTS.md            # AI agent / developer conventions
├── DEPLOY.md            # Railway deployment guide
├── static/
│   ├── css/
│   │   ├── style.css         # Theme system (dark/light)
│   │   └── page-loader.css   # Page loader animations
│   ├── js/
│   │   ├── security.js       # Auth, XSS prevention, debounce
│   │   ├── theme.js          # Dark/light mode toggle
│   │   ├── toast.js          # Notification system
│   │   ├── dashboard.js      # Chart.js analytics
│   │   ├── report.js         # Report charts
│   │   ├── logs.js           # Audit log rendering
│   │   ├── page-loader.js    # Page loader lifecycle
│   │   └── english-ui.js     # UI enhancements
│   └── uploads/              # User-uploaded images (ephemeral on Railway)
├── index.html              # Inward / Dashboard page
├── main_dashboard.html     # Executive dashboard
├── scanner.html            # Mobile QR scanner
├── items.html              # Item master CRUD
├── production.html         # Production entry + label printing
├── dispatch.html           # Dispatch plan management
├── challan.html            # Packing list & delivery challan
├── bom.html                # Bill of Materials
├── report.html             # Stock reports & charts
└── logs.html               # Audit log book
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/token` | Generate bearer access token |
| GET | `/api/auth/verify` | Verify token validity |
| GET | `/api/dashboard/stats` | Today's KPIs + 7-day chart data |
| GET | `/api/reports/end-to-end-summary` | Inward vs outward vs fulfillment summary |
| POST | `/api/items/add` | Add single item (with optional image) |
| POST | `/api/items/upload-excel` | Bulk import items from Excel |
| GET | `/api/items/list` | List items (paginated, filterable) |
| PUT | `/api/items/update/{id}` | Update item |
| POST | `/api/items/toggle-own/{id}` | Toggle own-production flag |
| POST | `/api/items/toggle-outsourced/{id}` | Toggle outsourced flag |
| POST | `/api/items/bulk-outsourced-by-group` | Bulk update by group |
| POST | `/api/items/bulk-own-by-group` | Bulk update by group |
| DELETE | `/api/items/delete/{id}` | Delete item |
| POST | `/api/inward` | Material received (auto-generates boxes + QR codes) |
| GET | `/api/inward/batch/{id}` | Get batch details |
| PUT | `/api/inward/update/{id}` | Update batch |
| DELETE | `/api/inward/delete/{id}` | Delete batch + boxes |
| POST | `/api/outward` | Issue material (QR scan or FIFO) |
| POST | `/api/non-dp-outward` | Non-DP outward (testing, scrap, sample, damage) |
| POST | `/api/fifo-outward` | FIFO-based outward |
| POST | `/api/production/entry` | Production log entry |
| POST | `/api/production/approve/{id}` | Approve production entry |
| GET | `/api/production/list` | List production logs |
| GET | `/api/production/machines` | List machines |
| POST | `/api/production/machines` | Add machine |
| POST | `/api/qc/request` | Create QC approval request |
| POST | `/api/qc/approve/{id}` | Approve QC request |
| POST | `/api/qc/reject/{id}` | Reject QC request |
| GET | `/api/qc/pending` | List pending QC requests |
| GET | `/api/qc/list` | List QC history |
| POST | `/api/dispatch-plan/create` | Create dispatch plan |
| GET | `/api/dispatch-plan/list` | List all dispatch plans |
| GET | `/api/dispatch-plan/{id}` | Get plan details |
| PUT | `/api/dispatch-plan/update/{id}` | Update plan |
| DELETE | `/api/dispatch-plan/delete/{id}` | Delete plan |
| POST | `/api/dispatch-plan/create-from-excel` | Create plan from PDF/Excel |
| POST | `/api/bom/save` | Save BOM definition |
| GET | `/api/bom/list` | List all BOMs |
| GET | `/api/logs` | Get audit logs (filterable) |

## Development

### Running Tests
```bash
pip install -r requirements-dev.txt
pytest test_app.py -v
```

### Local Server with Tunnel
```bash
python start_tunnels.py
```
This auto-starts MySQL (if running XAMPP), finds a free port, starts uvicorn, and opens a Cloudflare tunnel.

### Code Conventions
- All database writes use `get_db_ctx(commit=True)` context manager
- All SQL uses parameterized queries (`%s` placeholders)
- All actions log via `add_log(conn, action, details)`
- Live updates broadcast via WebSocket `manager.broadcast("STOCK_UPDATED")`

See `AGENTS.md` for full coding standards and `DEPLOY.md` for Railway deployment.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MYSQL_HOST` | Yes | `localhost` | MySQL host |
| `MYSQL_PORT` | Yes | `3307` | MySQL port (3306 in Railway) |
| `MYSQL_USER` | Yes | `root` | MySQL user |
| `MYSQL_PASSWORD` | Yes | *(empty)* | MySQL password |
| `MYSQL_DATABASE` | Yes | `inventory_db` | Database name |
| `ADMIN_PASSWORD` | No | `admin123` | Admin panel login |
| `API_SECRET_KEY` | No | `STORE_SECURE_TOKEN_V1` | Bearer token secret |
| `ALLOWED_ORIGINS` | No | `*` | CORS allowed origins (comma-separated) |

## License

Internal use — Bhumi Factory & Dispatch Manager
