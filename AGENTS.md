# AGENTS.md - Store System Project Guide

> This file documents project conventions, setup, and coding standards for both human developers and AI agents working on this codebase.

## Project Overview

**Name:** Bhumi Factory & Dispatch Manager
**Type:** Full-stack inventory management system
**Backend:** FastAPI (Python 3.12) + MySQL + SQLite fallback
**Frontend:** Standalone HTML pages with vanilla JS + Bootstrap 5 + Chart.js + QR code libraries
**Deployment:** Railway (primary) + local HTTPS via Cloudflare tunnel

## Architecture

### Backend Layer (`main.py` + `database.py`)
- `main.py` (4461 lines): FastAPI app with all REST API endpoints, WebSocket manager, page routes, and business logic
- `database.py` (628 lines): MySQL connection pooling, `init_db()` schema creation, context managers, auto-starts MySQL if stopped

### Frontend Layer (8 HTML pages + shared assets)
- `index.html` — Dashboard (QR generation, bulk QR, DP plans, item search)
- `main_dashboard.html` — Executive dashboard (Chart.js analytics, KPIs, theme toggle)
- `scanner.html` — Mobile QR scanner (HTML5 QR Code library)
- `items.html` — Item master CRUD (pagination, bulk ops, outsourced-group management)
- `production.html` — Machine production entry + TSC label printing
- `dispatch.html` — Dispatch plan management (A4 print styling)
- `challan.html` — Loading/packing list
- `bom.html` — Bill of Materials master
- `report.html` — Stock in/out reports (Chart.js visualization)
- `logs.html` — Audit log book

### Static Assets
- `static/css/style.css` — Central theme system (dark/light mode, CSS variables)
- `static/css/page-loader.css` — Page loader animations
- `static/js/security.js` — XSS prevention, debounce, AuthManager (token-based auth)
- `static/js/theme.js` — Theme toggle persistence
- `static/js/toast.js` — Toast notifications
- `static/js/dashboard.js` — Dashboard analytics + Chart.js
- `static/js/report.js` — Report data fetching + charts
- `static/js/logs.js` — Log table rendering
- `static/js/page-loader.js` — Page loader lifecycle
- `static/js/english-ui.js` — UI enhancements

### Infrastructure Scripts
- `start_local.bat` — Windows launcher (HTTPS, MySQL check, port 8000)
- `start_tunnels.py` — Cloudflare tunnel + uvicorn auto-launcher
- `migrate_data.py` — SQLite → MySQL data migration
- `test_app.py` — pytest unit tests (5 tests)

## Setup Instructions

### Local Development (Windows)
```bash
# 1. Create virtual environment
python -m venv venv

# 2. Activate and install
venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # for tests only

# 3. Configure MySQL (XAMPP on port 3307 recommended)
# 4. Copy .env.example to .env and fill values
# 5. Run
python start_tunnels.py
```

### Local Development (Railway CLI)
```bash
railway login
railway link  # link existing project
railway run python main.py
```

## Coding Standards

### Python
- Use 4-space indentation
- Type hints with `Optional`, `Union` from `typing`
- Use `get_db_ctx(commit=True)` context manager for all DB operations
- Use parameterized queries (`%s` placeholders) — never f-string SQL injection
- Catch specific exceptions (`mysql.connector.Error` for DB errors)
- Return `{"status": "Success", ...}` or `{"status": "error", ...}` consistently

### Frontend
- Bootstrap 5 CSS framework (loaded via CDN)
- Vanilla JS (no build step, no npm)
- All JS files go in `static/js/`
- Use `toast.js` for notifications
- Use `security.js` for `AuthManager` token handling
- Use `theme.js` for dark/light mode

### Environment Variables
See `.env.example` for complete list:
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- `ADMIN_PASSWORD` (admin panel login, default: `admin123`)
- `API_SECRET_KEY` (token generation, default: `STORE_SECURE_TOKEN_V1`)
- `ALLOWED_ORIGINS` (CORS whitelist, comma-separated)

## Testing
```bash
pip install -r requirements-dev.txt
pytest test_app.py -v
```

## Deployment Target
- **Railway** (production) — `railway.toml` + `Procfile` configured
- See `DEPLOY.md` for full Railway deployment guide

## Common Tasks for AI Agents

### Adding a new API endpoint
1. Add Pydantic request model if needed (e.g., `class NewRequest(BaseModel)`)
2. Add route in `main.py` using `@app.get/post/put/delete`
3. Use `get_db_ctx(commit=True)` for DB writes
4. Call `add_log(conn, "ACTION", details)` for audit trail
5. Broadcast `await manager.broadcast("STOCK_UPDATED")` for live updates

### Adding a new HTML page
1. Create `newpage.html` in project root
2. Add route in `main.py`: `@app.get("/newpage")` → `FileResponse("newpage.html")`
3. Add JS in `static/js/` as `newpage.js`
4. Include Bootstrap + shared JS (`toast.js`, `security.js`, `theme.js`)

### Database schema changes
1. Add `CREATE TABLE IF NOT EXISTS` in `database.py` `init_db()`
2. Add `ALTER TABLE ... ADD COLUMN` with try/except (idempotent)
3. Add indexes in the indexes list at the end of `init_db()`
